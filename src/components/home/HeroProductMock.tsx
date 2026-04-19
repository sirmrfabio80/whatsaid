/**
 * HeroProductMock — "WhatSaid Studio" visual product proof.
 * Pure Tailwind, theme-aware, no images, no real data, no logic.
 * Used as the right-column anchor of the redesigned hero.
 */
import { Sparkles } from "lucide-react";

export function HeroProductMock() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-[640px] mx-auto rounded-2xl border border-border/70 bg-card shadow-2xl shadow-primary/10 overflow-hidden motion-safe:animate-hero-mock-rise motion-reduce:animate-none"
      style={{ animationDelay: "120ms" }}
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

      {/* Subtle waveform + progress sliver */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60 bg-card">
        <div className="relative h-6 mb-1.5 overflow-hidden" aria-hidden="true">
          <div className="flex items-end gap-[2px] h-full w-[200%] motion-safe:animate-waveform-scroll motion-reduce:animate-none">
            {(() => {
              const bars = [
                0.35, 0.55, 0.42, 0.7, 0.5, 0.62, 0.85, 0.6, 0.48, 0.75, 0.58, 0.42,
                0.65, 0.9, 0.7, 0.55, 0.48, 0.72, 0.55, 0.38, 0.6, 0.78, 0.5, 0.62,
                0.45, 0.7, 0.55, 0.82, 0.6, 0.48, 0.42, 0.55, 0.68, 0.5, 0.4, 0.58,
                0.72, 0.5, 0.62, 0.45, 0.55, 0.7, 0.42, 0.6, 0.5, 0.35, 0.48, 0.55,
              ];
              // Duplicate the sequence so translateX(-50%) creates a seamless loop
              return [...bars, ...bars].map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-sm ${i % bars.length < 44 ? "bg-primary/60" : "bg-border"}`}
                  style={{ height: `${Math.max(8, h * 100)}%` }}
                />
              ));
            })()}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            Transcribing
          </span>
          <span className="text-[10px] font-mono text-primary tabular-nums">92%</span>
        </div>
        <div className="mt-1 h-0.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full w-[92%] bg-primary motion-safe:animate-progress-fill-92 motion-reduce:animate-none" />
        </div>
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

      {/* Transcript body */}
      <div className="relative p-5 sm:p-6 space-y-3.5">
        {[
          { dot: "bg-primary", name: "Sarah", time: "00:14", text: "We need to ship before Q2 — that's the bar." },
          { dot: "bg-accent", name: "Marco", time: "00:22", text: "Agreed. I'll own the rollout plan and timelines." },
          { dot: "bg-foreground/40", name: "Speaker 3", time: "00:31", text: "Let's review next Tuesday with the design team." },
        ].map((line) => (
          <div key={line.time} className="flex items-start gap-3">
            <span className={`mt-2 w-2 h-2 rounded-full ${line.dot} shrink-0`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-serif italic text-[13px] font-medium text-foreground">
                  {line.name}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {line.time}
                </span>
              </div>
              <p className="font-serif text-[15px] text-foreground/90 leading-relaxed">
                {line.text}
              </p>
            </div>
          </div>
        ))}

        {/* Speaker-suggestion chip floating at top-right of body */}
        <div className="absolute right-4 top-3 hidden sm:flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent px-2.5 py-1 text-[11px] font-medium shadow-sm">
          <Sparkles className="w-3 h-3" />
          Suggest: rename Speaker 3 → "Priya"
        </div>

        {/* Highlighted line with floating chip */}
        <div className="relative flex items-start gap-3 -mx-2 px-3 py-2 rounded-lg bg-primary/8 ring-1 ring-primary/20">
          <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-serif italic text-[13px] font-medium text-foreground">
                Sarah
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                00:47
              </span>
            </div>
            <p className="font-serif text-[15px] text-foreground/90 leading-relaxed">
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
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="motion-safe:animate-pulse-ring-slow motion-reduce:hidden absolute inset-0 rounded-full bg-accent/50" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-[11px] text-foreground/70">Saved · 3 speakers · 32:14</span>
        </div>
        <span className="text-[11px] text-foreground/70 font-mono tabular-nums">
          EN · auto-detected
        </span>
      </div>
    </div>
  );
}
