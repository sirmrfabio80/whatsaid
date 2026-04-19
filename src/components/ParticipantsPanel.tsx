import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Segment } from "@/lib/transcript";

interface ParticipantsPanelProps {
  segments: Segment[];
  speakerNames: Record<string, string>;
  durationSeconds: number | null;
  /** Optional element rendered to the right of the speaker chips on the first row (e.g. Listen button). */
  rightSlot?: React.ReactNode;
}

interface SpeakerStats {
  speaker: string;
  displayName: string;
  initials: string;
  totalSeconds: number;
  sharePercent: number;
  /** Array of [startFraction, endFraction] segments on 0–1 scale */
  timelineSegments: [number, number][];
}

function parseTimestampSeconds(ts: string | null): number | null {
  if (!ts) return null;
  const clean = ts.replace(/[\[\]]/g, "");
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

// Deterministic color palette for speaker avatars/timelines
const SPEAKER_COLORS = [
  "hsl(250, 75%, 55%)",   // primary
  "hsl(170, 65%, 45%)",   // accent
  "hsl(30, 80%, 55%)",    // warm amber
  "hsl(340, 65%, 52%)",   // rose
  "hsl(200, 70%, 50%)",   // sky
  "hsl(280, 60%, 55%)",   // violet
  "hsl(140, 55%, 42%)",   // emerald
  "hsl(50, 75%, 50%)",    // gold
];

function getSpeakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function computeStats(
  segments: Segment[],
  speakerNames: Record<string, string>,
  durationSeconds: number | null
): SpeakerStats[] {
  const speakerOrder: string[] = [];
  const speakerSegments: Record<string, { start: number; end: number }[]> = {};

  // Parse all timestamps and group by speaker
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.speaker) continue;

    if (!speakerSegments[seg.speaker]) {
      speakerSegments[seg.speaker] = [];
      speakerOrder.push(seg.speaker);
    }

    const startSec = parseTimestampSeconds(seg.timestamp);
    if (startSec === null) continue;

    // End = next segment's timestamp, or duration, or start + estimated duration
    let endSec: number | null = null;
    for (let j = i + 1; j < segments.length; j++) {
      const nextTs = parseTimestampSeconds(segments[j].timestamp);
      if (nextTs !== null) { endSec = nextTs; break; }
    }
    if (endSec === null) endSec = durationSeconds ?? startSec + 30;

    speakerSegments[seg.speaker].push({ start: startSec, end: Math.max(endSec, startSec + 1) });
  }

  const totalDuration = durationSeconds ?? Math.max(
    ...Object.values(speakerSegments).flat().map((s) => s.end),
    1
  );

  // Compute total speaking time per speaker
  let grandTotal = 0;
  const rawStats: { speaker: string; totalSec: number; segs: { start: number; end: number }[] }[] = [];

  for (const speaker of speakerOrder) {
    const segs = speakerSegments[speaker];
    const total = segs.reduce((sum, s) => sum + (s.end - s.start), 0);
    grandTotal += total;
    rawStats.push({ speaker, totalSec: total, segs });
  }

  // If no timestamps at all, return speakers with segment counts as fallback
  if (grandTotal === 0) {
    const segCounts: Record<string, number> = {};
    for (const seg of segments) {
      if (seg.speaker) segCounts[seg.speaker] = (segCounts[seg.speaker] ?? 0) + 1;
    }
    const totalSegs = Object.values(segCounts).reduce((a, b) => a + b, 0) || 1;
    return speakerOrder.map((speaker) => ({
      speaker,
      displayName: speakerNames[speaker] || speaker,
      initials: getInitials(speakerNames[speaker] || speaker),
      totalSeconds: 0,
      sharePercent: Math.round(((segCounts[speaker] ?? 0) / totalSegs) * 100),
      timelineSegments: [],
    }));
  }

  return rawStats.map(({ speaker, totalSec, segs }) => ({
    speaker,
    displayName: speakerNames[speaker] || speaker,
    initials: getInitials(speakerNames[speaker] || speaker),
    totalSeconds: totalSec,
    sharePercent: grandTotal > 0 ? Math.round((totalSec / grandTotal) * 100) : 0,
    timelineSegments: segs.map((s) => [
      s.start / totalDuration,
      s.end / totalDuration,
    ] as [number, number]),
  }));
}

export default function ParticipantsPanel({ segments, speakerNames, durationSeconds, rightSlot }: ParticipantsPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const stats = useMemo(
    () => computeStats(segments, speakerNames, durationSeconds),
    [segments, speakerNames, durationSeconds]
  );

  const speakers = useMemo(
    () => [...new Set(segments.map((s) => s.speaker).filter(Boolean))] as string[],
    [segments]
  );

  if (speakers.length === 0) return null;

  const hasTimeline = stats.some((s) => s.timelineSegments.length > 0);

  return (
    <div className="space-y-3">
      {/* Read-only speaker chips with optional right-aligned slot (e.g. Listen) */}
      <div className="flex items-start gap-3">
        <div
          className="flex-1 min-w-0 flex items-center gap-2 flex-wrap"
          role="group"
          aria-label={t("participants.title")}
        >
          <span className="text-xs text-muted-foreground font-medium mr-1">
            {t("participants.title")}
          </span>
          {speakers.map((speaker, i) => {
            const name = speakerNames[speaker] || speaker;
            return (
              <span
                key={speaker}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-xs font-medium"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getSpeakerColor(i) }}
                />
                <span>{name}</span>
              </span>
            );
          })}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      {/* Expandable participation overview */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full group cursor-pointer rounded-lg px-1 py-1 -mx-1 hover:bg-muted/30 transition-colors">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {t("participants.overview")}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="mt-2 rounded-xl border border-border/30 bg-muted/15 overflow-hidden">
            {stats.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">{t("participants.noData")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {stats.map((stat, i) => (
                  <div key={stat.speaker} className="px-4 py-3 space-y-2">
                    {/* Speaker row: avatar + name + stats */}
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-micro font-semibold text-white"
                        style={{ backgroundColor: getSpeakerColor(i) }}
                        aria-hidden="true"
                      >
                        {stat.initials}
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{stat.displayName}</p>
                        <div className="flex items-center gap-3 text-caption text-muted-foreground">
                          {stat.totalSeconds > 0 && (
                            <span>
                              {t("participants.spoken")}: {formatDuration(stat.totalSeconds)}
                            </span>
                          )}
                          <span>
                            {t("participants.share")}: {stat.sharePercent}%
                          </span>
                        </div>
                      </div>

                      {/* Share badge */}
                      <div className="shrink-0 text-right">
                        <span className="text-h3 tabular-nums text-foreground/80">
                          {stat.sharePercent}%
                        </span>
                      </div>
                    </div>

                    {/* Timeline bar */}
                    {hasTimeline && (
                      <div
                        className="relative h-2 rounded-full bg-muted/60 overflow-hidden"
                        role="img"
                        aria-label={`${stat.displayName} speaking timeline`}
                      >
                        {stat.timelineSegments.map(([start, end], j) => (
                          <div
                            key={j}
                            className="absolute inset-y-0 rounded-full"
                            style={{
                              left: `${start * 100}%`,
                              width: `${Math.max((end - start) * 100, 0.5)}%`,
                              backgroundColor: getSpeakerColor(i),
                              opacity: 0.75,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
