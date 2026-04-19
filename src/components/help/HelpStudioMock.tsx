/**
 * HelpStudioMock — Help-page hero anchor.
 *
 * Mirrors the visual language of HeroProductMock (homepage) and PricingStudioMock (pricing)
 * so all three primary marketing surfaces share one continuous premium identity:
 *   - rounded-2xl card with window chrome (3 dots, mono filename slot)
 *   - tab strip with primary underline on active
 *   - accent-teal pulse-ring "live" status indicator
 *   - same shadow, same border, same paddings, same theme tokens
 *   - same once-on-mount rise animation w/ staggered delay (320ms)
 *
 * All copy is localized via `help.mock.*` keys (EN / FR / IT).
 *
 * Pure Tailwind, theme-aware, no images, no real data, no logic.
 */
import { useTranslation } from "react-i18next";
import { Sparkles, Search, ChevronRight } from "lucide-react";

export function HelpStudioMock() {
  const { t } = useTranslation();

  const tabs = [
    { label: t("help.mock.tabFaq"), active: true },
    { label: t("help.mock.tabWorkflow"), active: false },
    { label: t("help.mock.tabTroubleshooting"), active: false },
  ];

  const rows = [
    { q: t("help.mock.demoQ1"), expanded: true },
    { q: t("help.mock.demoQ2"), expanded: false },
    { q: t("help.mock.demoQ3"), expanded: false },
  ];

  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[640px] mx-auto rounded-2xl border border-border/70 bg-card shadow-2xl shadow-primary/10 overflow-hidden motion-safe:animate-hero-mock-rise motion-reduce:animate-none"
      style={{ animationDelay: "320ms" }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-muted/40">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {t("help.mock.windowLabel")}
          </span>
        </div>
        <div className="w-8" />
      </div>

      {/* Search row — mimics page filter input */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60 bg-card">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <div className="h-8 w-full pl-8 pr-3 rounded-md border border-border/60 bg-muted/30 flex items-center">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {t("help.mock.demoQ1")}
            </span>
            <span className="ml-1 inline-block w-px h-3 bg-foreground/60 motion-safe:animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      {/* Tab strip — mirrors hero / pricing mocks */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-border/60">
        {tabs.map((tab) => (
          <div
            key={tab.label}
            className={`relative px-3 py-2 text-[12px] font-medium ${
              tab.active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {tab.label}
            {tab.active && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </div>
        ))}
      </div>

      {/* Body — FAQ list */}
      <div className="relative p-5 sm:p-6">
        {/* Sparkles "matched answer" chip floating at top-right */}
        <div className="absolute right-4 top-3 hidden sm:flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent px-2.5 py-1 text-[11px] font-medium shadow-sm">
          <Sparkles className="w-3 h-3" />
          {t("help.mock.matched", { count: 3 })}
        </div>

        {/* FAQ rows */}
        <div className="space-y-2 mb-3">
          {rows.map((row, i) => (
            <div
              key={row.q}
              className={`rounded-lg border ${
                row.expanded
                  ? "border-primary/20 bg-primary/8 ring-1 ring-primary/20"
                  : "border-border/60 bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      row.expanded ? "bg-primary" : "bg-foreground/30"
                    }`}
                  />
                  <span
                    className={`font-serif italic text-[13px] leading-snug ${
                      row.expanded ? "text-foreground font-medium" : "text-foreground/80"
                    }`}
                  >
                    {row.q}
                  </span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 transition-transform ${
                    row.expanded ? "rotate-90 text-primary" : ""
                  }`}
                />
              </div>
              {row.expanded && (
                <div className="px-3 pb-3 pl-7">
                  <p className="font-serif text-[13px] text-foreground/85 leading-relaxed">
                    {t("help.mock.demoAnswer")}
                  </p>
                </div>
              )}
              {!row.expanded && i < 2 && <span className="sr-only">divider</span>}
            </div>
          ))}
        </div>

        {/* Sub-row: helpful feedback line */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {t("help.mock.helpfulQuestion")}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            {t("help.mock.helpfulVotes", { percent: 94, count: 312 })
              .split(/(\d+%?)/)
              .map((part, i) =>
                /^\d+%?$/.test(part) && i === 1 ? (
                  <span key={i} className="text-primary font-medium">
                    {part}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
          </span>
        </div>
      </div>

      {/* Status bar — mirrors hero / pricing mocks */}
      <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="motion-safe:animate-pulse-ring-slow motion-reduce:hidden absolute inset-0 rounded-full bg-accent/50" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-[11px] text-foreground/70">
            {t("help.mock.statusLive", { count: 42 })}
          </span>
        </div>
        <span className="text-[11px] text-foreground/70 font-mono tabular-nums">
          EN · FR · IT
        </span>
      </div>
    </div>
  );
}
