import { useTranslation } from "react-i18next";
import { Clock, Plus } from "lucide-react";

/**
 * Single source of truth for the rule below: src/lib/pricing.ts → creditsForDuration().
 * 1 credit = 1 transcription up to 120 min. Longer files cost +1 credit per extra 120-min block,
 * up to the MAX_DURATION ceiling (480 min = 4 credits).
 */
export function CreditDurationTable() {
  const { t } = useTranslation();

  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-h2 mb-2">{t("pricing.creditTableTitle")}</h2>
          <p className="font-serif text-body text-muted-foreground">
            {t("pricing.creditTableSub")}
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 sm:p-10">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="font-serif text-h1 text-foreground tabular-nums">
              {t("pricing.creditTableHeadline", {
                defaultValue: "1 credit = 1 transcription, up to 120 min",
              })}
            </div>
            <p className="text-body text-muted-foreground max-w-xl">
              {t("pricing.creditTableBody", {
                defaultValue:
                  "Most recordings cost a single credit. Longer files use one extra credit for each additional 120 minutes.",
              })}
            </p>

            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-micro uppercase tracking-wide text-muted-foreground">
              <Plus className="w-3 h-3" aria-hidden="true" />
              {t("pricing.creditTableExtra", {
                defaultValue: "+1 credit per extra 120 min · max 480 min per file",
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
