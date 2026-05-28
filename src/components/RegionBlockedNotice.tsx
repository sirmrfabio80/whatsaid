import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Shown on signup/login when the user's region is not supported.
 * WhatSaid is currently available to UK residents only.
 */
export function RegionBlockedNotice({ reason }: { reason?: string }) {
  const { t } = useTranslation();
  const detail =
    reason === "declared_not_gb"
      ? t("regionBlocked.detailDeclaredNotGb")
      : reason === "ip_not_gb"
        ? t("regionBlocked.detailIpNotGb")
        : t("regionBlocked.detailDefault");

  return (
    <Alert variant="destructive" className="rounded-xl">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>{t("regionBlocked.title")}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{detail}</p>
        <p className="text-sm opacity-90">{t("regionBlocked.vpnAdvice")}</p>
        <p>
          {t("regionBlocked.questions")}{" "}
          <a
            href="mailto:support@whatsaid.app"
            className="underline font-medium"
          >
            support@whatsaid.app
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
