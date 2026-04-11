import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Globe, Calendar, Plus, Cpu } from "lucide-react";
import JobResults from "@/components/JobResults";
import type { JobMeta } from "@/components/JobResults";
import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<JobMeta | null>(null);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  if (!id) return null;

  const baseName = meta?.file_name?.replace(/\.[^.]+$/, "") ?? "";

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1.5 text-muted-foreground"
              onClick={() => navigate("/history")}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to history
            </Button>
            <Button
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => navigate("/convert")}
            >
              <Plus className="w-4 h-4" />
              New transcription
            </Button>
          </div>

          {/* Job heading with metadata */}
          {meta && (
            <div className="mb-6">
              <h1 className="font-heading text-xl sm:text-2xl font-bold truncate mb-2">
                {baseName || meta.file_name}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                  <Calendar className="w-3 h-3" />
                  {new Date(meta.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Badge>
                {meta.duration_seconds != null && (
                  <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                    <Clock className="w-3 h-3" />
                    {formatDuration(meta.duration_seconds)}
                  </Badge>
                )}
                {meta.language_detected && (
                  <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                    <Globe className="w-3 h-3" />
                    {getLanguageLabel(meta.language_detected)}
                  </Badge>
                )}
                {meta.speech_model && (
                  <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
                    <Cpu className="w-3 h-3" />
                    {meta.speech_model}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <JobResults jobId={id} onMetaLoaded={setMeta} />
        </div>
      </div>
    </div>
  );
}
