import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Mail, Link2, Loader2, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ShareButtonProps {
  jobId: string;
  disabled?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShareButton({ jobId, disabled }: ShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendingRecord, setSendingRecord] = useState(false);
  const [sentRecord, setSentRecord] = useState(false);

  const isValid = EMAIL_RE.test(email.trim());

  const handleSendEmail = async () => {
    if (!isValid || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("share-transcript", {
        body: { job_id: jobId, recipient_email: email.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || t("share.sendFailed"));
        return;
      }
      setSent(true);
      toast.success(t("share.sentSuccess"));
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setEmail("");
      }, 1500);
    } catch {
      toast.error(t("share.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const handleShareRecord = async () => {
    if (!isValid || sendingRecord) return;
    setSendingRecord(true);
    try {
      const { data, error } = await supabase.functions.invoke("share-transcript-record", {
        body: { job_id: jobId, recipient_email: email.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || t("share.sendFailed"));
        return;
      }
      setSentRecord(true);
      toast.success(t("share.recordSentSuccess"));
      setTimeout(() => {
        setOpen(false);
        setSentRecord(false);
        setEmail("");
      }, 1500);
    } catch {
      toast.error(t("share.sendFailed"));
    } finally {
      setSendingRecord(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTimeout(() => { setEmail(""); setSent(false); setSentRecord(false); }, 200);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg gap-1.5 text-xs h-8"
          disabled={disabled}
        >
          <Share2 className="w-3.5 h-3.5" />
          {t("share.share")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] sm:w-[380px] p-0 rounded-xl shadow-lg border-border/60"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/40">
          <h3 className="text-sm font-semibold text-foreground">{t("share.shareTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("share.shareDesc")}</p>
        </div>

        {/* Email input */}
        <div className="px-4 py-3 border-b border-border/40">
          <label htmlFor="share-email" className="sr-only">{t("share.emailLabel")}</label>
          <Input
            id="share-email"
            type="email"
            placeholder={t("share.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-lg text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
            disabled={sending || sent || sendingRecord || sentRecord}
            autoFocus
          />
        </div>

        {/* Action: Send by email */}
        <button
          onClick={handleSendEmail}
          disabled={!isValid || sending || sent || sendingRecord || sentRecord}
          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[56px] cursor-pointer"
        >
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
            {sent ? (
              <Check className="w-4 h-4 text-primary" />
            ) : sending ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <Mail className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {sent ? t("share.sent") : t("share.sendEmailLabel")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t("share.sendEmailDesc")}
            </p>
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
              {sentRecord ? (
                <Check className="w-4 h-4 text-primary" />
              ) : sendingRecord ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {sentRecord ? t("share.sent") : t("share.shareRecordLabel")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t("share.shareRecordDesc")}
              </p>
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
