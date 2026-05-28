import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import type { TosConsentStatus } from "@/hooks/use-tos-consent";
import { useTranslation } from "react-i18next";

interface Props {
  status: TosConsentStatus;
  recording: boolean;
  onReaccept: () => void;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ConsentStatusIndicator({ status, recording, onReaccept }: Props) {
  const { t } = useTranslation();

  if (status.state === "loading" || status.state === "anonymous") return null;

  if (status.state === "current") {
    return (
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <CheckCircle2 className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        <span>
          {t("convert.consentStatus.current", {
            version: status.acceptedVersion,
            date: formatDate(status.acceptedAt),
            defaultValue: "Terms accepted (v{{version}}) on {{date}}",
          })}
        </span>
      </div>
    );
  }

  const needsAction = status.state === "missing" || status.state === "outdated" || status.state === "error";
  if (!needsAction) return null;

  const message =
    status.state === "outdated"
      ? t("convert.consentStatus.outdated", {
          version: status.latestVersion,
          defaultValue: "Updated terms (v{{version}}) are available. Please re-accept.",
        })
      : status.state === "missing"
      ? t("convert.consentStatus.missing", {
          defaultValue: "Your acceptance of the Terms isn't on file yet.",
        })
      : t("convert.consentStatus.error", {
          defaultValue: "Couldn't verify your Terms acceptance.",
        });

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 text-body-sm text-foreground">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>{message}</span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start sm:self-auto rounded-lg"
        onClick={onReaccept}
        disabled={recording}
      >
        {recording ? (
          <>
            <InlineSpinner className="mr-2" />
            {t("convert.consentStatus.recording", { defaultValue: "Recording…" })}
          </>
        ) : (
          <>
            <RefreshCw className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            {t("convert.consentStatus.reaccept", { defaultValue: "Re-accept Terms" })}
          </>
        )}
      </Button>
    </div>
  );
}
