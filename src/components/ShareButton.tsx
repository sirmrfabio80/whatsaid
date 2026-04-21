import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Mail, Link2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDelayedCallback } from "@/hooks/use-delayed-callback";
import type { CanonicalExportData } from "@/lib/export-types";
import { generatePdfBlob } from "@/lib/export-pdf";

interface ShareButtonProps {
  jobId: string;
  disabled?: boolean;
  exportData?: CanonicalExportData | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPT_HINT_STORAGE_KEY = "share-email-autocomplete-hint-dismissed";
const ARROW_HINT_STORAGE_KEY = "share-email-autocomplete-arrow-hint-dismissed";

/**
 * Hash the canonical export payload so we can detect when the user has
 * edited transcript/summary/etc and a previously-uploaded PDF is no longer
 * representative. Stable JSON stringify is sufficient — keys come from a
 * fixed-shape object built by the export pipeline.
 */
async function hashExportData(data: CanonicalExportData): Promise<string> {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Share artifact format. Today only PDFs are uploaded for sharing, but the
 * cache key is format-aware so a future "share as DOCX/JSON" path can't
 * collide with an existing PDF entry that hashes to the same payload.
 */
type ShareFormat = "pdf" | "docx" | "json" | "txt";

const SHARE_CACHE_PREFIX = "share-pdf-cache:";
type ShareCacheEntry = { hash: string; path: string; format: ShareFormat };

function sessionKey(jobId: string, format: ShareFormat): string {
  return `${SHARE_CACHE_PREFIX}${jobId}:${format}`;
}

function readSessionCache(jobId: string, format: ShareFormat): ShareCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(jobId, format));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.hash === "string" &&
      typeof parsed.path === "string" &&
      // Defensive: tolerate older entries without `format` (treat as PDF
      // since that was the only format the previous cache stored).
      (parsed.format === undefined || parsed.format === format)
    ) {
      return { hash: parsed.hash, path: parsed.path, format };
    }
  } catch {
    /* noop */
  }
  return null;
}

function writeSessionCache(jobId: string, entry: ShareCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      sessionKey(jobId, entry.format),
      JSON.stringify(entry),
    );
  } catch {
    /* noop */
  }
}

function clearSessionCache(jobId: string, format: ShareFormat): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(sessionKey(jobId, format));
  } catch {
    /* noop */
  }
}

/**
 * Per-tab existence cache for share artifact paths. The result is only
 * useful for ~tens of seconds — long enough to absorb burst retries
 * (double-click, retry-after-network-blip), short enough to still notice
 * objects swept by the cleanup job. Tunable via `EXISTENCE_TTL_MS`.
 */
const EXISTENCE_TTL_MS = 30_000;
const existenceCache = new Map<string, { exists: boolean; checkedAt: number }>();

/**
 * Verify a previously-uploaded share artifact still exists in storage.
 *
 * Uses `createSignedUrl(path, 1)` instead of `.list()`:
 *   - Old approach paged up to 1000 sibling object records to find one
 *     name (O(N) over the directory, plus full metadata transfer).
 *   - Signed-URL minting is an O(1) row check: success ⇒ object present;
 *     PGRST/storage 404 ⇒ object missing or already swept.
 *
 * Stale paths (already removed by `cleanup-expired-shares`) still fail
 * loudly because the storage row no longer exists.
 */
async function shareArtifactStillExists(path: string): Promise<boolean> {
  if (!path || path.indexOf("/") < 0) return false;

  const cached = existenceCache.get(path);
  if (cached && Date.now() - cached.checkedAt < EXISTENCE_TTL_MS) {
    return cached.exists;
  }

  let exists = false;
  try {
    const { data, error } = await supabase.storage
      .from("shared-pdfs")
      .createSignedUrl(path, 1);
    exists = !error && !!data?.signedUrl;
  } catch {
    exists = false;
  }

  existenceCache.set(path, { exists, checkedAt: Date.now() });
  return exists;
}

/**
 * Look up a previously-uploaded artifact for `(jobId, hash, format)` in the
 * database cache. Works across tabs / devices for the same authenticated
 * user. The DB unique constraint is `(job_id, content_hash, format)` so
 * different formats with the same hash never alias.
 */
async function lookupDbCache(
  jobId: string,
  hash: string,
  format: ShareFormat,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("share_pdf_cache")
      .select("storage_path")
      .eq("job_id", jobId)
      .eq("content_hash", hash)
      .eq("format", format)
      .maybeSingle();
    if (error || !data) return null;
    return data.storage_path ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist a fresh artifact entry in the DB cache and bump `last_used_at`
 * on subsequent reuses. The unique constraint on
 * `(job_id, content_hash, format)` makes this safe under concurrent calls.
 */
async function persistDbCache(
  jobId: string,
  userId: string,
  hash: string,
  storagePath: string,
  format: ShareFormat,
): Promise<void> {
  try {
    await supabase.from("share_pdf_cache").upsert(
      {
        job_id: jobId,
        user_id: userId,
        content_hash: hash,
        storage_path: storagePath,
        format,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "job_id,content_hash,format" },
    );
  } catch {
    /* best effort */
  }
}

async function bumpDbCacheUsage(
  jobId: string,
  hash: string,
  format: ShareFormat,
): Promise<void> {
  try {
    await supabase
      .from("share_pdf_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("content_hash", hash)
      .eq("format", format);
  } catch {
    /* best effort */
  }
}

async function deleteDbCacheEntry(
  jobId: string,
  hash: string,
  format: ShareFormat,
): Promise<void> {
  try {
    await supabase
      .from("share_pdf_cache")
      .delete()
      .eq("job_id", jobId)
      .eq("content_hash", hash)
      .eq("format", format);
  } catch {
    /* best effort */
  }
}

/**
 * Record a share-artifact reuse / upload event so users (and admins) can
 * later answer "why did this share generate a new PDF instead of reusing
 * the previous one?". Best-effort, never blocks the share flow. Skipped
 * for unauthenticated users (no `user_id` to attribute the row to).
 */
type ShareLogEntry = {
  jobId: string;
  format: ShareFormat;
  hash: string;
  action: "reused" | "uploaded";
  source: "session" | "db" | "fresh" | "stale-session" | "stale-db";
  storagePath: string | null;
  reason?: string;
};

async function logShareEvent(entry: ShareLogEntry): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    await supabase.from("share_artifact_log").insert({
      user_id: userId,
      job_id: entry.jobId,
      format: entry.format,
      content_hash: entry.hash,
      action: entry.action,
      source: entry.source,
      storage_path: entry.storagePath,
      reason: entry.reason ?? null,
    });
  } catch {
    /* best effort — never block share */
  }
}

/**
 * Generate + upload a PDF for sharing, deduplicating across repeated share
 * attempts. Lookup order:
 *   1. In-tab session cache (fastest, no network)
 *   2. Database cache, scoped to the authenticated user (cross-tab/device)
 *   3. Generate + upload + persist to both caches
 *
 * The cache key is `(jobId, hash, format)` end-to-end so future non-PDF
 * share variants (DOCX, JSON, TXT) cannot reuse a PDF storage path. Edits
 * to the transcript/summary change the hash and force a fresh upload.
 * Stale storage paths (already swept by cleanup) are detected and the
 * cache entries cleared before re-uploading.
 */
async function uploadPdfForShare(
  jobId: string,
  data: CanonicalExportData,
): Promise<string | null> {
  const FORMAT: ShareFormat = "pdf";
  try {
    const hash = await hashExportData(data);

    // 1. Session cache (same tab)
    const sessionHit = readSessionCache(jobId, FORMAT);
    if (sessionHit && sessionHit.hash === hash) {
      if (await shareArtifactStillExists(sessionHit.path)) {
        void bumpDbCacheUsage(jobId, hash, FORMAT);
        return sessionHit.path;
      }
      clearSessionCache(jobId, FORMAT);
      void deleteDbCacheEntry(jobId, hash, FORMAT);
    }

    // 2. DB cache (cross-tab / cross-device for the same user)
    const dbHit = await lookupDbCache(jobId, hash, FORMAT);
    if (dbHit) {
      if (await shareArtifactStillExists(dbHit)) {
        writeSessionCache(jobId, { hash, path: dbHit, format: FORMAT });
        void bumpDbCacheUsage(jobId, hash, FORMAT);
        return dbHit;
      }
      void deleteDbCacheEntry(jobId, hash, FORMAT);
    }

    // 3. Generate fresh
    const blob = await generatePdfBlob(data);
    const path = `${jobId}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage
      .from("shared-pdfs")
      .upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (error) {
      console.error("PDF upload failed:", error);
      return null;
    }
    writeSessionCache(jobId, { hash, path, format: FORMAT });

    // Persist to DB cache so other tabs/devices can reuse. Best-effort —
    // requires an authenticated user; guests skip silently.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        void persistDbCache(jobId, userId, hash, path, FORMAT);
      }
    } catch {
      /* noop */
    }

    return path;
  } catch (err) {
    console.error("PDF generation failed:", err);
    return null;
  }
}


function ShareContent({
  email, setEmail, isValid, sending, sent, sendingRecord, sentRecord,
  handleSendEmail, handleShareRecord, t, autoFocusInput = true, recentRecipients,
  showAcceptHint, onAcceptSuggestion, showArrowHint, onAcceptArrowSuggestion, isMobile,
}: {
  email: string; setEmail: (v: string) => void; isValid: boolean;
  sending: boolean; sent: boolean; sendingRecord: boolean; sentRecord: boolean;
  handleSendEmail: () => void; handleShareRecord: () => void;
  t: (k: string) => string; autoFocusInput?: boolean; recentRecipients: string[];
  showAcceptHint: boolean; onAcceptSuggestion: () => void;
  showArrowHint: boolean; onAcceptArrowSuggestion: () => void; isMobile: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestion = useMemo(() => {
    const q = email;
    if (!q) return "";
    const qLower = q.toLowerCase();
    const match = recentRecipients.find(
      (r) => r.toLowerCase().startsWith(qLower) && r.toLowerCase() !== qLower,
    );
    if (!match) return "";
    return match.slice(q.length);
  }, [email, recentRecipients]);

  // Use refs so the native beforeinput listener (registered once) always sees
  // the latest values without re-binding listeners on every keystroke.
  const emailRef = useRef(email);
  const suggestionRef = useRef(suggestion);
  useEffect(() => { emailRef.current = email; }, [email]);
  useEffect(() => { suggestionRef.current = suggestion; }, [suggestion]);

  const acceptIfPossible = () => {
    const sug = suggestionRef.current;
    const cur = emailRef.current;
    if (!sug) return false;
    const el = inputRef.current;
    if (el && el.selectionStart !== cur.length) return false;
    const full = cur + sug;
    setEmail(full);
    onAcceptSuggestion();
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        const len = node.value.length;
        try { node.setSelectionRange(len, len); } catch { /* noop */ }
      }
    });
    return true;
  };

  // Native beforeinput listener — required for reliable Space detection on
  // iOS Safari and Android Chrome, where React's synthetic onBeforeInput is
  // polyfilled inconsistently and InputEvent fields are often missing.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onBeforeInput = (ev: Event) => {
      const e = ev as InputEvent;
      const data = typeof e.data === "string" ? e.data.replace(/\u00a0/g, " ") : e.data;
      const isSpaceInsert =
        (e.inputType === "insertText" || e.inputType === "insertCompositionText") &&
        typeof data === "string" &&
        data.length > 0 &&
        data.trim() === "";
      if (isSpaceInsert && suggestionRef.current) {
        if (acceptIfPossible()) {
          e.preventDefault();
        }
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showGhost = focused && suggestion.length > 0;

  return (
    <>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground">{t("share.shareTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("share.shareDesc")}</p>
      </div>

      {/* Email input */}
      <div className="px-4 py-3 border-b border-border/40">
        <label htmlFor="share-email" className="sr-only">{t("share.emailLabel")}</label>
        <div className="relative">
          <Input
            id="share-email"
            ref={inputRef}
            type="text"
            inputMode="email"
            placeholder={t("share.emailPlaceholder")}
            value={email}
            onChange={(e) => {
              const next = e.target.value;
              const normalizedNext = next.replace(/\u00a0/g, " ");
              // Final fallback: if a space was just appended at the end and we
              // have a live suggestion, accept the suggestion and drop the
              // space. This catches iOS autocorrect / IME paths where the
              // beforeinput event doesn't fire or its data is empty.
              if (
                suggestionRef.current &&
                normalizedNext.length > emailRef.current.length &&
                normalizedNext.startsWith(emailRef.current) &&
                normalizedNext.slice(emailRef.current.length).trim() === ""
              ) {
                acceptIfPossible();
                return;
              }
              setEmail(next);
            }}
            className="h-10 rounded-lg text-base md:text-sm bg-transparent relative z-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") { handleSendEmail(); return; }
              if ((e.key === " " || e.key === "Spacebar") && suggestion) {
                if (acceptIfPossible()) e.preventDefault();
              }
              if (e.key === "Tab" && suggestion && !e.shiftKey) {
                if (acceptIfPossible()) e.preventDefault();
              }
              if (e.key === "ArrowRight" && suggestion) {
                if (acceptIfPossible()) { e.preventDefault(); onAcceptArrowSuggestion(); }
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={sending || sent || sendingRecord || sentRecord}
            autoFocus={autoFocusInput}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="inline"
            enterKeyHint="send"
          />
          {showGhost && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center px-3 pointer-events-none text-base md:text-sm rounded-lg overflow-hidden"
            >
              <span className="invisible whitespace-pre">{email}</span>
              <span className="text-muted-foreground/60 whitespace-pre">{suggestion}</span>
            </div>
          )}
        </div>
        {isMobile && showAcceptHint && (
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            {t("share.spaceToAcceptHint")}
          </p>
        )}
        {!isMobile && showArrowHint && suggestion.length > 0 && (
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            {t("share.arrowRightToAcceptHint")}
          </p>
        )}
      </div>

      {/* Action: Send by email */}
      <button
        onClick={handleSendEmail}
        disabled={!isValid || sending || sent || sendingRecord || sentRecord}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[56px] cursor-pointer"
      >
        <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
          {sent ? <Check className="w-4 h-4 text-primary" /> : sending ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Mail className="w-4 h-4 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{sent ? t("share.sent") : t("share.sendEmailLabel")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("share.sendEmailDesc")}</p>
        </div>
      </button>

      {/* Action: Share as record */}
      <div className="border-t border-border/40">
        <button
          onClick={handleShareRecord}
          disabled={!isValid || sending || sent || sendingRecord || sentRecord}
          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[56px] cursor-pointer"
        >
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
            {sentRecord ? <Check className="w-4 h-4 text-primary" /> : sendingRecord ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Link2 className="w-4 h-4 text-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{sentRecord ? t("share.sent") : t("share.shareRecordLabel")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("share.shareRecordDesc")}</p>
          </div>
        </button>
      </div>
    </>
  );
}

export default function ShareButton({ jobId, disabled, exportData }: ShareButtonProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendingRecord, setSendingRecord] = useState(false);
  const [sentRecord, setSentRecord] = useState(false);
  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);
  const [hasDismissedAcceptHint, setHasDismissedAcceptHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ACCEPT_HINT_STORAGE_KEY) === "1";
  });
  const [hasDismissedArrowHint, setHasDismissedArrowHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ARROW_HINT_STORAGE_KEY) === "1";
  });

  const { schedule: scheduleAutoClose } = useDelayedCallback();
  const { schedule: scheduleResetOnClose } = useDelayedCallback();

  const isValid = EMAIL_RE.test(email.trim());

  const fetchRecentRecipients = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      const { data, error } = await supabase
        .from("transcript_shares")
        .select("recipient_email, created_at")
        .eq("shared_by", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error || !data) return;
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const row of data) {
        const raw = (row.recipient_email ?? "").trim();
        if (!raw) continue;
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(raw);
        if (unique.length >= 50) break;
      }
      setRecentRecipients(unique);
    } catch {
      // silent
    }
  };

  const handleSendEmail = async () => {
    if (!isValid || sending) return;
    setSending(true);
    try {
      // Generate and upload PDF if export data is available
      let pdfPath: string | null = null;
      if (exportData) {
        pdfPath = await uploadPdfForShare(jobId, exportData);
      }

      const { data, error } = await supabase.functions.invoke("share-transcript", {
        body: { job_id: jobId, recipient_email: email.trim(), pdf_storage_path: pdfPath },
      });
      if (error || data?.error) { toast.error(data?.error || t("share.sendFailed")); return; }
      setSent(true);
      toast.success(t("share.sentSuccess"));
      scheduleAutoClose(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setOpen(false);
        setSent(false);
        setEmail("");
      }, 1500);
    } catch { toast.error(t("share.sendFailed")); } finally { setSending(false); }
  };

  const handleShareRecord = async () => {
    if (!isValid || sendingRecord) return;
    setSendingRecord(true);
    try {
      const { data, error } = await supabase.functions.invoke("share-transcript-record", {
        body: { job_id: jobId, recipient_email: email.trim() },
      });
      if (error || data?.error) { toast.error(data?.error || t("share.sendFailed")); return; }
      setSentRecord(true);
      toast.success(t("share.recordSentSuccess"));
      scheduleAutoClose(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setOpen(false);
        setSentRecord(false);
        setEmail("");
      }, 1500);
    } catch { toast.error(t("share.sendFailed")); } finally { setSendingRecord(false); }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setOpen(next);
    if (next) {
      void fetchRecentRecipients();
    } else {
      scheduleResetOnClose(() => {
        setEmail("");
        setSent(false);
        setSentRecord(false);
        setRecentRecipients([]);
      }, 200);
    }
  };

  const handleAcceptSuggestion = () => {
    if (hasDismissedAcceptHint) return;
    setHasDismissedAcceptHint(true);
    try {
      window.localStorage.setItem(ACCEPT_HINT_STORAGE_KEY, "1");
    } catch {
      // silent
    }
  };

  const handleAcceptArrowSuggestion = () => {
    if (hasDismissedArrowHint) return;
    setHasDismissedArrowHint(true);
    try {
      window.localStorage.setItem(ARROW_HINT_STORAGE_KEY, "1");
    } catch {
      // silent
    }
  };

  const trigger = (
    <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8" disabled={disabled}>
      <Share2 className="w-3.5 h-3.5" />
      {t("share.share")}
    </Button>
  );

  const contentProps = {
    email, setEmail, isValid, sending, sent, sendingRecord, sentRecord,
    handleSendEmail, handleShareRecord, t, autoFocusInput: !isMobile, recentRecipients,
    showAcceptHint: !hasDismissedAcceptHint && open,
    onAcceptSuggestion: handleAcceptSuggestion,
    showArrowHint: !hasDismissedArrowHint && open,
    onAcceptArrowSuggestion: handleAcceptArrowSuggestion,
    isMobile,
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-xl max-h-[90dvh] overflow-y-auto"
        >
          <ShareContent {...contentProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[380px] p-0 rounded-xl shadow-lg border-border/60"
      >
        <ShareContent {...contentProps} />
      </PopoverContent>
    </Popover>
  );
}
