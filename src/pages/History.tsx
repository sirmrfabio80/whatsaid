import { useEffect, useState } from "react";
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
import { FileAudio, Clock, Globe, ArrowRight, Inbox, Cpu, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { useNavigate } from "react-router-dom";

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
}

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, file_name, title, status, duration_seconds, language_detected, language_selected, credits_charged, created_at, speech_model")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setJobs((data as Job[]) ?? []);
      setLoading(false);
    };
    fetchJobs();
  }, [user, navigate]);

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
      <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
        <div className="container mx-auto px-4 py-10 sm:py-14">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="h-8 w-64 bg-muted rounded-lg animate-pulse mb-8" />
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-8">{t("history.title")}</h1>

          {jobs.length === 0 ? (
            <Card className="border-dashed rounded-xl shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="font-medium text-lg mb-1">{t("history.empty")}</p>
                <p className="text-muted-foreground text-sm mb-6">{t("history.emptyDesc")}</p>
                <Button className="rounded-xl" onClick={() => navigate("/convert")}>
                  <FileAudio className="w-4 h-4 mr-2" />{t("history.startTranscribing")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
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
                            <Badge variant="outline" className={`${statusColor(job.status)} text-[11px]`}>{job.status}</Badge>
                            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                          </div>
                        </div>
                        {job.title && <p className="text-xs text-muted-foreground/60 truncate">{job.file_name}</p>}
                        <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {job.duration_seconds && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(job.duration_seconds)}</span>}
                          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{getLanguageLabel(job.language_selected ?? job.language_detected)}</span>
                          <span>{new Date(job.created_at).toLocaleDateString()}</span>
                          {job.speech_model && <span className="hidden sm:flex items-center gap-1"><Cpu className="w-3 h-3" />{job.speech_model}</span>}
                        </div>
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
              ))}
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
