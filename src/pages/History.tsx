import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileAudio, Clock, Globe, ArrowRight, Inbox, Cpu, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

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
      // Delete outputs first (FK dependency), then the job
      await supabase.from("job_outputs").delete().eq("job_id", deleteTarget.id);
      const { error } = await supabase.from("jobs").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
      toast({ title: "Transcription deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
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
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        Loading your transcriptions...
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-8">Transcription History</h1>

          {jobs.length === 0 ? (
            <Card className="border-dashed rounded-xl shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="font-medium text-lg mb-1">No transcriptions yet</p>
                <p className="text-muted-foreground text-sm mb-6">Upload your first audio file to get started.</p>
                <Button className="rounded-xl" onClick={() => navigate("/convert")}>
                  <FileAudio className="w-4 h-4 mr-2" />
                  Start transcribing
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id} className="rounded-xl border-border/50 shadow-sm hover:border-primary/30 transition-colors group">
                  <CardContent className="p-4 sm:p-5 flex items-center gap-4">
                    <div
                      className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/job/${job.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/job/${job.id}`); }}
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileAudio className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{job.title || job.file_name.replace(/\.[^.]+$/, "")}</p>
                        {job.title && (
                          <p className="text-xs text-muted-foreground/60 truncate">{job.file_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {job.duration_seconds && (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(job.duration_seconds)}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {getLanguageLabel(job.language_selected ?? job.language_detected)}
                          </span>
                          <span>{new Date(job.created_at).toLocaleDateString()}</span>
                          {job.speech_model && (
                            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{job.speech_model}</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={statusColor(job.status)}>
                        {job.status}
                      </Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(job);
                      }}
                      aria-label={`Delete ${job.file_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transcription?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">{deleteTarget?.file_name}</span> and all its outputs including summary, transcript, and saved questions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
