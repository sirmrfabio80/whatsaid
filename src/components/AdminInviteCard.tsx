import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Send, Link2, Check, AlertCircle, Copy, Gift, Globe } from "lucide-react";
import { toast } from "sonner";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

const PACKAGES = [
  { id: "one-time", credits: 1 },
  { id: "5-pack", credits: 5 },
  { id: "20-pack", credits: 20 },
] as const;

const UI_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Français" },
] as const;

export default function AdminInviteCard() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [packageId, setPackageId] = useState<string>("one-time");
  const [inviteLanguage, setInviteLanguage] = useState<string>("en");
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const { copy } = useCopyToClipboard({ successMessage: t("common.copied") });

  const { data: invites, refetch: refetchInvites } = useQuery({
    queryKey: ["admin-invites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_invites")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const sendInvite = async (method: "email" | "magic-link") => {
    if (!email || !email.includes("@")) {
      toast.error(t("settings.admin.invalidEmail"));
      return;
    }
    setLoading(true);
    setMagicLink(null);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: email.trim().toLowerCase(), packageId, method, language: inviteLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.creditsGrantedImmediately) {
        toast.success(t("settings.admin.creditsGranted", { credits: data.credits, email }));
      } else if (method === "magic-link" && data.magicLinkUrl) {
        setMagicLink(data.magicLinkUrl);
        toast.success(t("settings.admin.linkGenerated"));
      } else {
        toast.success(t("settings.admin.inviteSent", { email }));
      }
      setEmail("");
      refetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (magicLink) copy(magicLink);
  };

  return (
    <Card className="rounded-xl border-primary/30 bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" />
          <h2 className="text-h2">{t("settings.admin.title")}</h2>
        </div>
        <p className="text-body-sm text-muted-foreground">{t("settings.admin.desc")}</p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t("settings.admin.emailLabel")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="rounded-lg h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.admin.packageLabel")}</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger className="rounded-lg h-11 w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACKAGES.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {t(`settings.admin.pkg_${pkg.id}`)} — {pkg.credits} {t("common.credits")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              {t("settings.admin.languageLabel")}
            </Label>
            <Select value={inviteLanguage} onValueChange={setInviteLanguage}>
              <SelectTrigger className="rounded-lg h-11 w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UI_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => sendInvite("email")}
              disabled={loading}
              className="rounded-lg"
              size="sm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {t("settings.admin.sendEmail")}
            </Button>
            <Button
              onClick={() => sendInvite("magic-link")}
              disabled={loading}
              variant="outline"
              className="rounded-lg"
              size="sm"
            >
              <Link2 className="w-4 h-4 mr-1.5" />
              {t("settings.admin.generateLink")}
            </Button>
          </div>

          {magicLink && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <Input
                value={magicLink}
                readOnly
                className="rounded-lg h-9 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="ghost" onClick={copyLink} className="shrink-0">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {invites && invites.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("settings.admin.recentInvites")}
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Gift className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{inv.email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {inv.credits} {t("common.credits")}
                    </span>
                    <Badge
                      variant={inv.claimed ? "default" : "secondary"}
                      className="text-micro px-1.5"
                    >
                      {inv.claimed
                        ? t("settings.admin.claimed")
                        : t("settings.admin.pending")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
