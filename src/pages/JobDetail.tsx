import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { ArrowLeft, Clock, Globe, Calendar, Plus, Pencil, Check, Timer, MapPin, Type, BookOpen } from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import JobResults from "@/components/JobResults";
import type { JobMeta } from "@/types/job";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { supabase } from "@/integrations/supabase/client";
import { formatRecordedDate, formatRecordedTime, toLocalDate, replaceDate, replaceTime } from "@/lib/recorded-date";
import { parseISO6709, formatCoordinates, mapsUrl, reverseGeocode } from "@/lib/location";
import JobDetailTags from "@/components/JobDetailTags";
import { parseSegments } from "@/lib/transcript";
import { clearTabBadge } from "@/lib/tab-title-badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Inline style helper for the staggered reveal sequence on this page.
 * Each block uses the existing `fade-in` keyframe (opacity + translateY)
 * with an increasing delay so the screen reveals top-to-bottom in one
 * coordinated motion. `animationFillMode: "both"` keeps the start state
 * applied before the delay elapses (prevents flash-of-finished-state).
 */
const revealStyle = (delayMs: number): React.CSSProperties => ({
  animationDelay: `${delayMs}ms`,
  animationFillMode: "both",
});
const REVEAL_CLASS = "motion-safe:animate-fade-in motion-reduce:animate-none";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [title, setTitle] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  /** The raw ISO string for the recording date — preserved with original offset */
  const [recordedIso, setRecordedIso] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Coordinated reveal: flips true once both meta header AND JobResults
  // initial fetch are done, so all blocks animate in a single ordered sweep.
  const [metaReady, setMetaReady] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const revealReady = metaReady && resultsReady;

  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [user, authLoading, navigate]);

  // Reset the tab title badge when the user opens a job detail page —
  // they've clearly seen the completion notification.
  useEffect(() => {
    clearTabBadge();
  }, [id]);

  // Reset reveal flags whenever we navigate between jobs so the sequence
  // re-runs cleanly for the new job's data.
  useEffect(() => {
    setMetaReady(false);
    setResultsReady(false);
  }, [id]);

  // Track job status (with realtime updates) for the live "processing" pulse-ring
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("jobs").select("status").eq("id", id).maybeSingle();
      if (!cancelled && data?.status) setJobStatus(data.status as string);
    })();
    const channel = supabase
      .channel(`job-status-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${id}` },
        (payload) => {
          const next = (payload.new as { status?: string } | null)?.status;
          if (next) setJobStatus(next);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const getEffectiveIso = (m: JobMeta) => m.recorded_at ?? m.created_at;

  const handleMetaLoaded = async (m: JobMeta) => {
    setMeta(m);
    const displayTitle = m.title || m.file_name?.replace(/\.[^.]+$/, "") || "";
    setTitle(displayTitle);
    setRecordedIso(getEffectiveIso(m));
    // Only auto-generate a title when the job is actually completed.
    // Calling generate-title for jobs still uploading / processing / failed
    // produces a noisy retry loop because no transcript exists yet (see logs).
    if (!m.title && id && jobStatus === "completed") generateTitle();

    // Lazy reverse geocoding: resolve label if we have coordinates but no cached label
    if (m.metadata_location_iso6709 && !m.location_label) {
      const loc = parseISO6709(m.metadata_location_iso6709);
      if (loc) {
        const label = await reverseGeocode(loc);
        if (label && id) {
          setLocationLabel(label);
          await supabase.from("jobs").update({ location_label: label } as any).eq("id", id);
        }
      }
    } else if (m.location_label) {
      setLocationLabel(m.location_label);
    }

    // Word count from transcript output (strip speaker labels & timestamps)
    if (id) {
      const { data: transcriptOutput } = await supabase
        .from("job_outputs")
        .select("content")
        .eq("job_id", id)
        .eq("output_type", "transcript")
        .maybeSingle();
      if (transcriptOutput?.content) {
        const segs = parseSegments(transcriptOutput.content);
        const allText = segs.map((s) => s.text).join(" ");
        const words = allText.trim().split(/\s+/).filter(Boolean).length;
        setWordCount(words);
      }
    }

    setMetaReady(true);
  };

  const handleResultsReady = useCallback(() => {
    setResultsReady(true);
  }, []);

  const generateTitle = async () => {
    if (!id) return;
    setGeneratingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-title", { body: { job_id: id } });
      if (!error && data?.title) setTitle(data.title);
    } catch {} finally { setGeneratingTitle(false); }
  };

  const startEditing = () => {
    setEditValue(title);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const saveTitle = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || !id) { setEditing(false); return; }
    setTitle(trimmed);
    setEditing(false);
    await supabase.from("jobs").update({ title: trimmed } as any).eq("id", id);
  };

  const handleDateChange = async (date: Date | undefined) => {
    if (!date || !id || !recordedIso) return;
    const newIso = replaceDate(recordedIso, date.getFullYear(), date.getMonth() + 1, date.getDate());
    setRecordedIso(newIso);
    setDatePickerOpen(false);
    await supabase.from("jobs").update({ recorded_at: newIso, recorded_at_source: "manual" } as any).eq("id", id);
  };

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !recordedIso) return;
    const [hours, minutes] = e.target.value.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;
    const newIso = replaceTime(recordedIso, hours, minutes);
    setRecordedIso(newIso);
    await supabase.from("jobs").update({ recorded_at: newIso, recorded_at_source: "manual" } as any).eq("id", id);
  };

  const displayIso = recordedIso ?? (meta ? getEffectiveIso(meta) : null);
  const displayDate = displayIso ? formatRecordedDate(displayIso) : "";
  const displayTime = displayIso ? formatRecordedTime(displayIso) : "";
  const calendarDate = displayIso ? toLocalDate(displayIso) : undefined;

  if (!id) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-5 sm:px-6 py-6 sm:py-10">
        <div className="max-w-3xl mx-auto">
          {/* Skeleton placeholder — holds layout until all data is in,
              so the staggered reveal below runs in one coordinated sweep
              without prior content jumping or popping in. */}
          {!revealReady && (
            <div aria-hidden="true" className="animate-pulse motion-safe:skeleton-shimmer">
              <div className="flex items-center justify-between mb-8">
                <Skeleton className="h-9 w-32 rounded-md" />
                <Skeleton className="h-9 w-40 rounded-full" />
              </div>
              <div className="mb-8">
                <Skeleton className="h-9 w-3/4 rounded-lg mb-4" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Skeleton className="h-7 w-32 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="h-7 w-28 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <div className="mt-5">
                  <Skeleton className="h-7 w-48 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}

          <div className={revealReady ? "block" : "hidden"}>
            {/* Block 1 — top action bar */}
            <div className={`flex items-center justify-between mb-8 ${REVEAL_CLASS}`} style={revealStyle(0)}>
              <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={() => navigate("/history")}>
                <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">{t("jobDetail.backToHistory")}</span>
              </Button>
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => navigate("/convert")}>
                <Plus className="w-4 h-4" />{t("jobDetail.newTranscription")}
              </Button>
            </div>

            {meta && (
              <div className="mb-8">
                {/* Block 2 — title row */}
                <div className={`flex items-center gap-2 mb-3 group ${REVEAL_CLASS}`} style={revealStyle(80)}>
                  {editing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditing(false); }}
                        onBlur={saveTitle}
                        className="text-2xl sm:text-3xl font-bold h-auto py-0.5 px-1.5 rounded-lg border-primary/30"
                        aria-label="Job title"
                        maxLength={100}
                      />
                      <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0 rounded-lg" onClick={saveTitle} aria-label={t("common.save")}>
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h1
                        className="text-2xl sm:text-3xl font-bold truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={startEditing}
                        title={t("jobDetail.clickToRename")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") startEditing(); }}
                      >
                        {generatingTitle ? (
                          <InlineSpinner
                            size="sm"
                            tone="muted"
                            label={t("jobDetail.generatingTitle")}
                            className="text-lg"
                          />
                        ) : (
                          title || meta.file_name
                        )}
                      </h1>
                      {!generatingTitle && (
                        <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={startEditing} aria-label={t("jobDetail.clickToRename")}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {/* Block 3 — metadata chip row */}
                <div className={`flex items-center gap-2 flex-wrap ${REVEAL_CLASS}`} style={revealStyle(160)}>
                  {jobStatus && (jobStatus === "processing" || jobStatus === "pending" || jobStatus === "uploading") && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-1 text-xs font-medium">
                      <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
                        <span className="motion-safe:animate-pulse-ring-slow motion-reduce:hidden absolute inset-0 rounded-full bg-warning/50" />
                        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-warning" />
                      </span>
                      {t(`jobDetail.status.${jobStatus}`, { defaultValue: jobStatus })}
                    </span>
                  )}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors cursor-pointer">
                        <Calendar className="w-3 h-3" />
                        {displayDate}
                        <span className="opacity-40">·</span>
                        <Clock className="w-3 h-3" />
                        {displayTime}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarWidget mode="single" selected={calendarDate} onSelect={handleDateChange} initialFocus className="p-3 pointer-events-auto" />
                      <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input type="time" value={displayTime} onChange={handleTimeChange} className="bg-transparent text-sm font-medium text-foreground outline-none w-full [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100" aria-label={t("jobDetail.recordingTime")} />
                      </div>
                      {meta.duration_seconds != null && (
                        <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Timer className="w-3.5 h-3.5 shrink-0" />
                          <span>{t("jobDetail.durationLabel", { duration: formatDuration(meta.duration_seconds) })}</span>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {meta.duration_seconds != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium">
                      <Timer className="w-3 h-3" />{formatDuration(meta.duration_seconds)}
                    </span>
                  )}
                  {meta.language_detected && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium">
                      <Globe className="w-3 h-3" />{getLanguageLabel(meta.language_detected)}
                    </span>
                  )}
                  {wordCount != null && wordCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium">
                      <Type className="w-3 h-3" />{t("jobDetail.wordsLabel", { count: wordCount })}
                    </span>
                  )}
                  {wordCount != null && wordCount > 0 && (() => {
                    const minutes = Math.round(wordCount / 200);
                    const label = minutes < 1 ? t("jobDetail.readingTimeSecLabel") : t("jobDetail.readingTimeMinLabel", { minutes });
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium">
                        <BookOpen className="w-3 h-3" />{label}
                      </span>
                    );
                  })()}
                  {(() => {
                    const loc = meta.metadata_location_iso6709 ? parseISO6709(meta.metadata_location_iso6709) : null;
                    if (!loc) return null;
                    const label = locationLabel || formatCoordinates(loc);
                    return (
                      <a
                        href={mapsUrl(loc)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex"
                        title={formatCoordinates(loc)}
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors cursor-pointer">
                          <MapPin className="w-3 h-3" />{label}
                        </span>
                      </a>
                    );
                  })()}
                </div>
                {/* Block 4 — tags */}
                <div className={`mt-5 ${REVEAL_CLASS}`} style={revealStyle(240)}>
                  <JobDetailTags jobId={id} />
                </div>
              </div>
            )}

            {/* Block 5 — results card (tabs + content). Mounted only after
                revealReady so it animates in cleanly. The hidden pre-fetch
                mount below drives onReady. */}
            {revealReady && (
              <div className={REVEAL_CLASS} style={revealStyle(320)}>
                <JobResults
                  jobId={id}
                  currentTitle={title}
                  onMetaLoaded={handleMetaLoaded}
                  onReady={handleResultsReady}
                />
              </div>
            )}
          </div>

          {/* Hidden pre-fetch mount: drives onMetaLoaded + onReady so the
              parent knows when to trigger the coordinated reveal. Unmounts
              once revealReady; the visible JobResults above takes over. */}
          {!revealReady && (
            <div className="sr-only" aria-hidden="true">
              <JobResults
                jobId={id}
                currentTitle={title}
                onMetaLoaded={handleMetaLoaded}
                onReady={handleResultsReady}
                suppressInitialLoadingState
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
