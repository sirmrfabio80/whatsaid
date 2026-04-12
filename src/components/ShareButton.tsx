import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Mail, Link2, Loader2, Check } from "lucide-react";
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

type ActiveAction = null | "email" | "record";

export default function ShareButton({ jobId, disabled }: ShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState<ActiveAction>(null);
  const [sent, setSent] = useState<ActiveAction>(null);

  const isValid = EMAIL_RE.test(email.trim());

  const handleSendEmail = async () => {
    if (!isValid || sending) return;
    setSending("email");
    try {
      const { data, error } = await supabase.functions.invoke("share-transcript", {
        body: { job_id: jobId, recipient_email: email.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || t("share.sendFailed"));
        return;
      }
      setSent("email");
      toast.success(t("share.sentSuccess"));
      setTimeout(() => { setOpen(false); setSent(null); setEmail(""); }, 1500);
    } catch {
      toast.error(t("share.sendFailed"));
    } finally {
      setSending(null);
    }
  };

  const handleShareRecord = async () => {
    if (!isValid || sending) return;
    setSending("record");
    try {
      const { data, error } = await supabase.functions.invoke("share-transcript-record", {
        body: { job_id: jobId, recipient_email: email.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || t("share.sendFailed"));
        return;
      }
      setSent("record");
      toast.success(t("share.recordSentSuccess"));
      setTimeout(() => { setOpen(false); setSent(null); setEmail(""); }, 1500);
    } catch {
      toast.error(t("share.sendFailed"));
    } finally {
      setSending(null);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTimeout(() => { setEmail(""); setSent(null); }, 200);
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
        className="w-[340px] sm:w-[380px] p-0 rounded-xl shadow-lg border-border/60"
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
            disabled={!!sending || !!sent}
            autoFocus
          />
        </div>

        {/* Action: Send by email */}
        <button
          onClick={handleSendEmail}
          disabled={!isValid || !!sending || !!sent}
          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[56px] cursor-pointer"
        >
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
            {sent === "email" ? (
              <Check className="w-4 h-4 text-primary" />
            ) : sending === "email" ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <Mail className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {sent === "email" ? t("share.sent") : t("share.sendEmailLabel")}
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
            disabled={!isValid || !!sending || !!sent}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[56px] cursor-pointer"
          >
            <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
              {sent === "record" ? (
                <Check className="w-4 h-4 text-primary" />
              ) : sending === "record" ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {sent === "record" ? t("share.recordSent") : t("share.shareRecordLabel")}
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
