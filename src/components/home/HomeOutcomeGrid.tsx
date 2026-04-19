import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Sparkles, MessageSquareText, Check } from "lucide-react";

function GradientBadge({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center text-primary mb-5"
    >
      {children}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-secondary text-muted-foreground">
      <Check aria-hidden="true" className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

export function HomeOutcomeGrid() {
  const { t } = useTranslation();

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <p className="font-serif italic text-caption text-primary/80 mb-3">
          {t("home.outcomeEyebrow")}
        </p>
        <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("home.outcomeTitle")}</h2>
        <p className="font-serif text-body text-muted-foreground">
          {t("home.outcomeDesc")}
        </p>
      </div>

      <div className="grid gap-6 max-w-6xl mx-auto lg:grid-cols-3 lg:grid-rows-2">
        {/* Transcript — hero card, spans 2 cols × 2 rows on lg */}
        <Card className="rounded-2xl border-border/60 bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all lg:col-span-2 lg:row-span-2 overflow-hidden">
          <CardContent className="p-6 sm:p-8 flex flex-col h-full">
            <GradientBadge>
              <FileText className="w-6 h-6" />
            </GradientBadge>
            <h3 className="text-h3 mb-2">{t("home.outTranscriptTitle")}</h3>
            <p className="font-serif text-body text-muted-foreground mb-5 leading-relaxed">
              {t("home.outTranscriptDesc")}
            </p>
            <ul className="space-y-2 mb-6">
              <Bullet>{t("home.outTranscriptBullet1")}</Bullet>
              <Bullet>{t("home.outTranscriptBullet2")}</Bullet>
            </ul>

            {/* Visual sample flourish */}
            <div
              aria-hidden="true"
              className="mt-auto rounded-xl border border-border/50 bg-muted/30 p-4 sm:p-5 space-y-2"
            >
              <p className="font-serif text-caption text-muted-foreground">
                <span className="tabular-nums text-primary/70">00:14</span>{" "}
                <span className="text-foreground/80">Sarah</span> — We need to ship before Q2.
              </p>
              <p className="font-serif text-caption text-muted-foreground">
                <span className="tabular-nums text-primary/70">00:22</span>{" "}
                <span className="text-foreground/80">Marco</span> — Agreed. I'll own the rollout plan.
              </p>
              <p className="font-serif text-caption text-muted-foreground">
                <span className="tabular-nums text-primary/70">00:31</span>{" "}
                <span className="text-foreground/80">Sarah</span> — Let's review next Tuesday.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="rounded-2xl border-border/60 bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <CardContent className="p-6 sm:p-7">
            <GradientBadge>
              <Sparkles className="w-6 h-6" />
            </GradientBadge>
            <h3 className="text-h3 mb-2">{t("home.outSummaryTitle")}</h3>
            <p className="font-serif text-body text-muted-foreground mb-4 leading-relaxed">
              {t("home.outSummaryDesc")}
            </p>
            <ul className="space-y-2">
              <Bullet>{t("home.outSummaryBullet1")}</Bullet>
              <Bullet>{t("home.outSummaryBullet2")}</Bullet>
            </ul>
          </CardContent>
        </Card>

        {/* Q&A */}
        <Card className="rounded-2xl border-border/60 bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <CardContent className="p-6 sm:p-7">
            <GradientBadge>
              <MessageSquareText className="w-6 h-6" />
            </GradientBadge>
            <h3 className="text-h3 mb-2">{t("home.outQATitle")}</h3>
            <p className="font-serif text-body text-muted-foreground mb-4 leading-relaxed">
              {t("home.outQADesc")}
            </p>
            <ul className="space-y-2">
              <Bullet>{t("home.outQABullet1")}</Bullet>
              <Bullet>{t("home.outQABullet2")}</Bullet>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
