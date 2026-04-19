/**
 * HeroProductMock — "WhatSaid Studio" visual product proof.
 * Pure Tailwind, theme-aware, no images, no real data, no logic.
 * Used as the right-column anchor of the redesigned hero.
 */
export function HeroProductMock() {
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
            interview-q3.m4a · 32:14
          </span>
        </div>
        <div className="w-8" />
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-border/60">
        {[
          { label: "Transcript", active: true },
          { label: "Summary", active: false },
          { label: "Questions", active: false },
        ].map((t) => (
          <div
            key={t.label}
            className={`relative px-3 py-2 text-caption font-medium ${
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

      {/* Transcript body */}
      <div className="p-5 sm:p-6 space-y-3.5">
        {[
          { dot: "bg-primary", name: "Sarah", time: "00:14", text: "We need to ship before Q2 — that's the bar." },
          { dot: "bg-accent", name: "Marco", time: "00:22", text: "Agreed. I'll own the rollout plan and timelines." },
          { dot: "bg-muted-foreground/50", name: "Priya", time: "00:31", text: "Let's review next Tuesday with the design team." },
        ].map((line) => (
          <div key={line.time} className="flex items-start gap-3">
            <span className={`mt-2 w-2 h-2 rounded-full ${line.dot} shrink-0`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-serif italic text-secondary text-foreground">{line.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{line.time}</span>
              </div>
              <p className="font-serif text-body text-foreground/85 leading-relaxed">{line.text}</p>
            </div>
          </div>
        ))}

        {/* Highlighted line with floating chip */}
        <div className="relative flex items-start gap-3 -mx-2 px-2 py-2 rounded-lg bg-primary/8 ring-1 ring-primary/15">
          <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-serif italic text-secondary text-foreground">Sarah</span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">00:47</span>
            </div>
            <p className="font-serif text-body text-foreground/85 leading-relaxed">
              I'll commit to the launch date if engineering signs off by Friday.
            </p>
          </div>
          <div className="hidden sm:flex absolute -right-2 -top-2 items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-[11px] font-medium shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/90" />
            Ask about this
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] text-muted-foreground">Saved · 3 speakers · 32:14</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono tabular-nums">EN · auto-detected</span>
      </div>
    </div>
  );
}
