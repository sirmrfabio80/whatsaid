import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileAudio, Clock, Globe, ArrowRight, Inbox, Trash2, SearchX } from "lucide-react";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { useNavigate } from "react-router-dom";
import { useHistoryFilters } from "@/hooks/use-history-filters";
import { useTranslatedTags } from "@/hooks/use-translated-tags";
import HistoryFilters from "@/components/HistoryFilters";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

interface Job {
  id: string;
  file_name: string;
  title: string | null;
  status: string;
  duration_seconds: number | null;
  language_detected: string | null;
  language_selected: string | null;
  credits_charged: number;
  created_at: string;
  speech_model: string | null;
  short_summary: string | null;
}

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  const jobIds = useMemo(() => jobs.map((j) => j.id), [jobs]);
  const filters = useHistoryFilters(user?.id, jobIds);
  const translatedUserTags = useTranslatedTags(filters.userTags);
  const translatedSuggestions = useTranslatedTags(filters.tagSuggestions);
  const translatedSelected = useTranslatedTags(filters.selectedTags);

  // Build lookup for translated display names by tag id
  const tagDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of translatedUserTags) map.set(t.id, t.displayName);
    return map;
  }, [translatedUserTags]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    let cancelled = false;
    const fetchJobs = async () => {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from("jobs")
        .select("id, file_name, title, status, duration_seconds, language_detected, language_selected, credits_charged, created_at, speech_model, short_summary")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(true);
        setJobs([]);
      } else {
        setJobs((data as Job[]) ?? []);
      }
      setLoading(false);
    };
    fetchJobs();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  // Apply combined filters
  const filteredJobs = useMemo(() => {
    let result = jobs;

    // Tag filter
    if (filters.tagFilteredJobIds !== null) {
      result = result.filter((j) => filters.tagFilteredJobIds!.has(j.id));
    }

    // Search filter
    if (filters.debouncedSearch) {
      const q = filters.debouncedSearch.toLowerCase();
      result = result.filter((j) => {
        const title = (j.title || j.file_name).toLowerCase();
        const summary = (j.short_summary || "").toLowerCase();
        return title.includes(q) || summary.includes(q);
      });
    }

    return result;
  }, [jobs, filters.tagFilteredJobIds, filters.debouncedSearch]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from("job_outputs").delete().eq("job_id", deleteTarget.id);
      const { error } = await supabase.from("jobs").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
    } catch {} finally { setDeleting(false); setDeleteTarget(null); }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-success/10 text-success border-success/20";
      case "processing": return "bg-warning/10 text-warning border-warning/20";
      case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
        <div className="container mx-auto px-5 sm:px-6 py-6 sm:py-10">
          <div className="max-w-3xl mx-auto">
            <LoadingState rows={3} titleWidth="w-64" rowHeight="h-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-5 sm:px-6 py-6 sm:py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-h1 sm:text-[1.875rem] mb-6">{t("history.title")}</h1>

          {/* Filters — show when there are jobs */}
          {jobs.length > 0 && (
            <HistoryFilters
              searchQuery={filters.searchQuery}
              onSearchChange={filters.setSearchQuery}
              tagSuggestions={translatedSuggestions}
              selectedTags={translatedSelected}
              onToggleTag={filters.toggleTag}
              onClearAll={filters.clearAll}
              hasActiveFilters={filters.hasActiveFilters}
              hasAnyTags={filters.userTags.length > 0}
            />
          )}

          {loadError ? (
            <ErrorState
              title={t("history.loadError")}
              description={t("history.loadErrorDesc")}
              action={
                <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
                  {t("common.tryAgain")}
                </Button>
              }
            />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t("history.empty")}
              description={t("history.emptyDesc")}
              action={
                <Button className="rounded-xl" onClick={() => navigate("/convert")}>
                  <FileAudio className="w-4 h-4 mr-2" />{t("history.startTranscribing")}
                </Button>
              }
            />
          ) : filteredJobs.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t("history.noResults")}
              description={t("history.noResultsDesc")}
              action={
                <Button variant="outline" className="rounded-xl" onClick={filters.clearAll}>
                  {t("history.clearAll")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => {
                const jobTags = filters.getJobTags(job.id);
                return (
                  <Card key={job.id} className="rounded-xl border-border shadow-sm hover:border-primary/20 hover:shadow-md transition-all group">
                    <CardContent className="p-4 sm:p-5">
                      <div
                        className="flex items-start sm:items-center gap-3 sm:gap-4 cursor-pointer"
                        onClick={() => navigate(`/job/${job.id}`)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") navigate(`/job/${job.id}`); }}
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileAudio className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-medium truncate">{job.title || job.file_name.replace(/\.[^.]+$/, "")}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={`${statusColor(job.status)} text-[11px] inline-flex items-center gap-1.5`}>
                                {(job.status === "processing" || job.status === "pending" || job.status === "uploading") && (
                                  <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
                                    <span className="motion-safe:animate-pulse-ring-slow motion-reduce:hidden absolute inset-0 rounded-full bg-warning/50" />
                                    <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-warning" />
                                  </span>
                                )}
                                {job.status}
                              </Badge>
                              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                            </div>
                          </div>
                          {job.title && <p className="text-caption text-muted-foreground/60 truncate">{job.file_name}</p>}
                          <div className="flex items-center gap-2 sm:gap-3 mt-1 text-caption text-muted-foreground flex-wrap">
                            {job.duration_seconds && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(job.duration_seconds)}</span>}
                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{getLanguageLabel(job.language_selected ?? job.language_detected)}</span>
                            <span>{new Date(job.created_at).toLocaleDateString()}</span>
                          </div>
                          {job.short_summary && (
                            <p className="text-caption text-muted-foreground/70 mt-2 line-clamp-2 leading-relaxed">{job.short_summary}</p>
                          )}
                          {/* Tag chips */}
                          {jobTags.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                              {jobTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro bg-muted text-muted-foreground border border-border/40"
                                >
                                  {tag.color && (
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                  )}
                                  {tagDisplayMap.get(tag.id) ?? tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end mt-2 sm:mt-0">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(job); }}
                          aria-label={`${t("common.delete")} ${job.file_name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("history.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span dangerouslySetInnerHTML={{ __html: t("history.deleteDesc", { fileName: deleteTarget?.file_name ?? "" }) }} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("history.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
