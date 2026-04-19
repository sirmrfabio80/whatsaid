/**
 * PricingStudioMock — Pricing-page hero anchor.
 *
 * Mirrors the visual language of HeroProductMock from the homepage:
 *   - rounded-2xl card with window chrome (3 dots, mono filename slot)
 *   - tab strip with primary underline on active
 *   - accent-teal "Saved" status indicator
 *   - same shadow, same border, same paddings, same theme tokens
 *
 * Content is tailored to pricing/credits — a "Receipt + Credit ledger" surface —
 * so the page tells a continuous product story without duplicating the hero mock.
 *
 * Pure Tailwind, theme-aware, no images, no real data, no logic.
 */
import { Check, Sparkles } from "lucide-react";

export function PricingStudioMock() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[640px] mx-auto rounded-2xl border border-border/70 bg-card shadow-2xl shadow-primary/10 overflow-hidden"
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
            credits · 5-pack receipt
          </span>
        </div>
        <div className="w-8" />
      </div>

      {/* Tab strip — mirrors hero mock */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-border/60">
        {[
          { label: "Receipt", active: true },
          { label: "Ledger", active: false },
          { label: "Usage", active: false },
        ].map((t) => (
          <div
            key={t.label}
            className={`relative px-3 py-2 text-[12px] font-medium ${
              t.active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {t.label}
            {t.active && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </div>
        ))}
      </div>

      {/* Body — Receipt surface */}
      <div className="relative p-5 sm:p-6">
        {/* Sparkles "save" chip floating at top-right */}
        <div className="absolute right-4 top-3 hidden sm:flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent px-2.5 py-1 text-[11px] font-medium shadow-sm">
          <Sparkles className="w-3 h-3" />
          Best value · save 40%
        </div>

        {/* Header row */}
        <div className="flex items-baseline justify-between mb-4">
          <span className="font-serif italic text-[13px] text-muted-foreground">
            5-credit pack
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            INV-2026-0418
          </span>
        </div>

        {/* Line items */}
        <div className="space-y-2.5 mb-4">
          {[
            { label: "5 credits", sub: "Pay once · never expire", value: "£14.99" },
            { label: "Per credit", sub: "5 audio files · up to ~75 min each", value: "£3.00" },
            { label: "Tax", sub: "Calculated at checkout", value: "—" },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 py-2 px-3 rounded-lg bg-muted/40"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground leading-tight">
                  {row.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {row.sub}
                </div>
              </div>
              <div className="font-mono text-[13px] tabular-nums text-foreground shrink-0">
                {row.value}
              </div>
            </div>
          ))}
        </div>

        {/* Total — emphasised line, mirrors hero "highlighted line" treatment */}
        <div className="relative flex items-center justify-between gap-3 -mx-2 px-3 py-3 rounded-lg bg-primary/8 ring-1 ring-primary/20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="font-serif italic text-[13px] font-medium text-foreground">
              Total today
            </span>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="font-serif italic text-primary text-[15px]">£</span>
            <span className="font-mono text-[18px] font-semibold tabular-nums text-foreground">
              14.99
            </span>
          </div>
        </div>

        {/* Sub-row: balance preview */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">After purchase</span>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            balance · <span className="text-primary font-medium">5 credits</span>
          </span>
        </div>
      </div>

      {/* Status bar — mirrors hero mock */}
      <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] text-foreground/70 inline-flex items-center gap-1.5">
            <Check className="w-3 h-3 text-accent" />
            Pay once · no subscription
          </span>
        </div>
        <span className="text-[11px] text-foreground/70 font-mono tabular-nums">
          GBP · VAT at checkout
        </span>
      </div>
    </div>
  );
}
