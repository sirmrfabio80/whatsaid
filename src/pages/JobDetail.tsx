import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { ArrowLeft, Clock, Globe, Calendar, Plus, Pencil, Check, Loader2, Timer, MapPin } from "lucide-react";
import JobResults from "@/components/JobResults";
import type { JobMeta } from "@/components/JobResults";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { supabase } from "@/integrations/supabase/client";
import { formatRecordedDate, formatRecordedTime, toLocalDate, replaceDate, replaceTime } from "@/lib/recorded-date";
import { parseISO6709, formatCoordinates, mapsUrl, reverseGeocode } from "@/lib/location";
import JobDetailTags from "@/components/JobDetailTags";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [user, authLoading, navigate]);

  const getEffectiveIso = (m: JobMeta) => m.recorded_at ?? m.created_at;

  const handleMetaLoaded = async (m: JobMeta) => {
    setMeta(m);
    const displayTitle = m.title || m.file_name?.replace(/\.[^.]+$/, "") || "";
    setTitle(displayTitle);
    setRecordedIso(getEffectiveIso(m));
    if (!m.title && id) generateTitle();

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
  };

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
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={() => navigate("/history")}>
              <ArrowLeft className="w-4 h-4" />{t("jobDetail.backToHistory")}
            </Button>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => navigate("/convert")}>
              <Plus className="w-4 h-4" />{t("jobDetail.newTranscription")}
            </Button>
          </div>

          {meta && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 group">
                {editing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      ref={inputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditing(false); }}
                      onBlur={saveTitle}
                      className="font-heading text-xl sm:text-2xl font-bold h-auto py-0.5 px-1.5 rounded-lg border-primary/30"
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
                      className="font-heading text-xl sm:text-2xl font-bold truncate cursor-pointer hover:text-primary/80 transition-colors"
                      onClick={startEditing}
                      title={t("jobDetail.clickToRename")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") startEditing(); }}
                    >
                      {generatingTitle ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-lg">{t("jobDetail.generatingTitle")}</span>
                        </span>
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
              <div className="flex items-center gap-3 flex-wrap">
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer">
                      <Calendar className="w-3 h-3" />
                      {displayDate}
                      <span className="text-muted-foreground">·</span>
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
                  <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                    <Timer className="w-3 h-3" />{formatDuration(meta.duration_seconds)}
                  </Badge>
                )}
                {meta.language_detected && (
                  <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                    <Globe className="w-3 h-3" />{getLanguageLabel(meta.language_detected)}
                  </Badge>
                )}
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
                      <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer">
                        <MapPin className="w-3 h-3" />{label}
                      </Badge>
                    </a>
                  );
                })()}
              </div>
            </div>
          )}

          <JobResults jobId={id} currentTitle={title} onMetaLoaded={handleMetaLoaded} />
        </div>
      </div>
    </div>
  );
}
