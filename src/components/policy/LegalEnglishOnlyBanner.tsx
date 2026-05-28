/**
 * LegalEnglishOnlyBanner
 *
 * Shown at the top of legal/policy pages (Privacy, Terms, Refund,
 * Accessibility) when the user's active locale is NOT English.
 *
 * Phase 1 policy: legal text is EN-only until a UK-law translator
 * reviews the IT/FR versions. The page body is force-rendered in EN
 * via i18n.getFixedT('en'); this banner tells the user, in their
 * own language, that:
 *   (a) the English text below is the legally binding version,
 *   (b) reviewed translations are coming,
 *   (c) they can contact support for clarification.
 *
 * Hidden entirely on English locales — no-op.
 */
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

const SUPPORT_EMAIL = "support@whatsaid.app";

export function LegalEnglishOnlyBanner() {
  const { t, i18n } = useTranslation();
  if ((i18n.language || "en").startsWith("en")) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 rounded-lg border border-border bg-muted/40 p-4 flex gap-3"
    >
      <Info
        aria-hidden="true"
        className="w-5 h-5 text-primary shrink-0 mt-0.5"
      />
      <div className="space-y-1">
        <p className="text-body-sm font-medium text-foreground">
          {t("legalBanner.title")}
        </p>
        <p className="text-body-sm text-muted-foreground leading-relaxed">
          {t("legalBanner.body")}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {t("legalBanner.contact")}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
