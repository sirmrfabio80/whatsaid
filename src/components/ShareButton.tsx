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

const PDF_CACHE_PREFIX = "share-pdf-cache:";
type PdfCacheEntry = { hash: string; path: string };

function readPdfCache(jobId: string): PdfCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PDF_CACHE_PREFIX + jobId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.hash === "string" &&
      typeof parsed.path === "string"
    ) {
      return parsed;
    }
  } catch {
    /* noop */
  }
  return null;
}

function writePdfCache(jobId: string, entry: PdfCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PDF_CACHE_PREFIX + jobId,
      JSON.stringify(entry),
    );
  } catch {
    /* noop */
  }
}

function clearPdfCache(jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PDF_CACHE_PREFIX + jobId);
  } catch {
    /* noop */
  }
}

/**
 * Verify a previously-uploaded PDF still exists in storage. Avoids reusing
 * a cached path that the cleanup job has already swept (shares older than
 * `expires_at` purge their PDFs).
 */
async function pdfStillExists(path: string): Promise<boolean> {
  try {
    const slash = path.lastIndexOf("/");
    if (slash < 0) return false;
    const dir = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const { data, error } = await supabase.storage
      .from("shared-pdfs")
      .list(dir, { limit: 1000, search: name });
    if (error || !data) return false;
    return data.some((f) => f.name === name);
  } catch {
    return false;
  }
}

/**
 * Generate + upload a PDF for sharing, deduplicating across repeated share
 * attempts in the same tab. If the same job + identical export payload was
 * already uploaded, the existing storage path is reused — no second PDF is
 * generated and no second blob is uploaded. Edits to the transcript/summary
 * change the hash and force a fresh PDF.
 */
async function uploadPdfForShare(
  jobId: string,
  data: CanonicalExportData,
): Promise<string | null> {
  try {
    const hash = await hashExportData(data);
    const cached = readPdfCache(jobId);
    if (cached && cached.hash === hash) {
      if (await pdfStillExists(cached.path)) {
        return cached.path;
      }
      // Stale (cleanup swept it or share expired) — fall through and re-upload.
      clearPdfCache(jobId);
    }

    const blob = await generatePdfBlob(data);
    const path = `${jobId}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage
      .from("shared-pdfs")
      .upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (error) {
      console.error("PDF upload failed:", error);
      return null;
    }
    writePdfCache(jobId, { hash, path });
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
