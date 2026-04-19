import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptMock } from "./mocks/TranscriptMock";
import { SummaryMock } from "./mocks/SummaryMock";
import { QAMock } from "./mocks/QAMock";

export function HomeOutcomeGrid() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const tabs = [
    { id: "transcript", label: t("home.outcomeTabTranscript") },
    { id: "summary", label: t("home.outcomeTabSummary") },
    { id: "qa", label: t("home.outcomeTabQA") },
  ];

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto text-center mb-10">
        <p className="font-serif italic text-caption text-primary mb-3">
          {t("home.outcomeEyebrow")}
        </p>
        <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("home.outcomeTitleNew")}</h2>
        <p className="font-serif text-body text-muted-foreground">
          {t("home.outcomeDesc")}
        </p>
      </div>

      <div className="max-w-6xl mx-auto rounded-2xl border border-border/70 bg-card shadow-xl shadow-primary/5 overflow-hidden">
        {/* Header strip */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive/50" />
              <span className="w-2 h-2 rounded-full bg-warning/60" />
              <span className="w-2 h-2 rounded-full bg-success/60" />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:inline ml-2">
              quarterly-review.m4a · 32:14
            </span>
          </div>
          {/* Desktop decorative segmented control */}
          {!isMobile && (
            <div
              aria-hidden="true"
              className="hidden lg:inline-flex items-center rounded-lg border border-border/60 bg-card p-0.5"
            >
              {tabs.map((tab, i) => (
                <span
                  key={tab.id}
                  className={`px-3 py-1.5 text-caption font-medium rounded-md ${
                    i === 0
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {tab.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mobile: shadcn Tabs */}
        {isMobile ? (
          <Tabs defaultValue="transcript" className="p-5">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-caption">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="transcript" className="min-h-[340px]">
              <TranscriptMock />
            </TabsContent>
            <TabsContent value="summary" className="min-h-[340px]">
              <SummaryMock />
            </TabsContent>
            <TabsContent value="qa" className="min-h-[340px]">
              <QAMock />
            </TabsContent>
          </Tabs>
        ) : (
          /* Desktop / tablet: 3 panes side-by-side (md+) or stacked (sm) */
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">
            <div className="p-6 sm:p-7 min-h-[420px]">
              <TranscriptMock />
            </div>
            <div className="p-6 sm:p-7 min-h-[420px] bg-muted/20">
              <SummaryMock />
            </div>
            <div className="p-6 sm:p-7 min-h-[420px]">
              <QAMock />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
