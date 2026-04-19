import { useTranslation } from "react-i18next";

/**
 * Single source of truth: brackets mirror creditsForDuration() in src/lib/pricing.ts.
 * If pricing.ts changes its brackets, update both together.
 */
const BRACKETS = [
  { duration: "≤ 15 min", credits: 1 },
  { duration: "≤ 30 min", credits: 2 },
  { duration: "≤ 45 min", credits: 3 },
  { duration: "≤ 60 min", credits: 4 },
];

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

        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-4 sm:divide-x sm:divide-border/60 divide-y divide-border/60 sm:divide-y-0">
            {BRACKETS.map(({ duration, credits }) => (
              <div
                key={duration}
                className="text-center py-4 sm:py-2 sm:px-4 first:pt-0 sm:first:pt-2 last:pb-0 sm:last:pb-2"
              >
                <div className="font-serif text-h1 text-foreground tabular-nums">
                  {duration}
                </div>
                <div className="text-micro uppercase tracking-wide text-muted-foreground mt-2">
                  {t("pricing.creditTableUnit", {
                    count: credits,
                    defaultValue: credits === 1 ? "1 credit" : `${credits} credits`,
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
