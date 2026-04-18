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
import type { CanonicalExportData } from "@/lib/export-types";
import { generatePdfBlob } from "@/lib/export-pdf";

interface ShareButtonProps {
  jobId: string;
  disabled?: boolean;
  exportData?: CanonicalExportData | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function uploadPdfForShare(jobId: string, data: CanonicalExportData): Promise<string | null> {
  try {
    const blob = await generatePdfBlob(data);
    const path = `${jobId}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage
      .from("shared-pdfs")
      .upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (error) {
      console.error("PDF upload failed:", error);
      return null;
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
}: {
  email: string; setEmail: (v: string) => void; isValid: boolean;
  sending: boolean; sent: boolean; sendingRecord: boolean; sentRecord: boolean;
  handleSendEmail: () => void; handleShareRecord: () => void;
  t: (k: string) => string; autoFocusInput?: boolean; recentRecipients: string[];
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

  const acceptIfPossible = () => {
    if (!suggestion) return false;
    const el = inputRef.current;
    if (el && el.selectionStart !== email.length) return false;
    setEmail(email + suggestion);
    // Move caret to end after React updates
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        const len = node.value.length;
        try { node.setSelectionRange(len, len); } catch { /* noop */ }
      }
    });
    return true;
  };

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
            type="email"
            placeholder={t("share.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-lg text-base md:text-sm bg-transparent relative z-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") { handleSendEmail(); return; }
              if (e.key === " " && suggestion) {
                if (acceptIfPossible()) e.preventDefault();
              }
              if (e.key === "Tab" && suggestion && !e.shiftKey) {
                if (acceptIfPossible()) e.preventDefault();
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={sending || sent || sendingRecord || sentRecord}
            autoFocus={autoFocusInput}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="inline"
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
      setTimeout(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setOpen(false); setSent(false); setEmail(""); }, 1500);
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
      setTimeout(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setOpen(false); setSentRecord(false); setEmail(""); }, 1500);
    } catch { toast.error(t("share.sendFailed")); } finally { setSendingRecord(false); }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setOpen(next);
    if (next) {
      void fetchRecentRecipients();
    } else {
      setTimeout(() => { setEmail(""); setSent(false); setSentRecord(false); setRecentRecipients([]); }, 200);
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
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="p-0 rounded-t-xl">
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
