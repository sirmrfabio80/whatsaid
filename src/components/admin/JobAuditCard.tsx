import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobRow {
  id: string;
  file_name: string;
  title: string | null;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  language_selected: string | null;
  language_detected: string | null;
  location_label: string | null;
  speech_model: string | null;
  audio_channels: number | null;
  transcription_config: Record<string, unknown> | null;
  user_id: string | null;
}

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  failed: "destructive",
  processing: "secondary",
  pending: "outline",
  uploading: "outline",
};

export default function JobAuditCard({ job }: { job: JobRow }) {
  const cfg = (job.transcription_config ?? {}) as Record<string, unknown>;
  const requestedLang = (cfg.language_code as string | undefined) ?? null;
  const detectionRequested = Boolean(cfg.language_detection);
  const langMismatch =
    job.language_selected &&
    job.language_selected !== "auto" &&
    job.language_detected &&
    job.language_selected !== job.language_detected;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">
              {job.title || job.file_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
              {job.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[job.status] ?? "outline"}>{job.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick facts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Fact label="Created" value={`${relativeTime(job.created_at)}`} sub={new Date(job.created_at).toLocaleString()} />
          <Fact label="Duration" value={formatDuration(job.duration_seconds)} />
          <Fact label="Channels" value={job.audio_channels?.toString() ?? "—"} />
          <Fact label="Model" value={job.speech_model ?? "—"} />
          <Fact label="File" value={job.file_name} mono />
          <Fact label="Country / Location" value={job.location_label ?? "—"} />
          <Fact label="User" value={job.user_id ? `${job.user_id.slice(0, 8)}…` : "guest"} mono />
          <Fact
            label="Strategy"
            value={(cfg.strategy as string) ?? (cfg.route as string) ?? "—"}
          />
        </div>

        {/* Language audit */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Language audit</h4>
            {langMismatch && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Mismatch
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <LangPill label="user picked" value={job.language_selected ?? "—"} />
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <LangPill
              label="sent to AAI"
              value={
                detectionRequested
                  ? "auto-detect"
                  : requestedLang ?? (job.language_selected === "auto" ? "auto-detect" : "—")
              }
            />
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <LangPill
              label="AAI detected"
              value={job.language_detected ?? "—"}
              highlight={!!langMismatch}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            language_detection: <code className="font-mono">{String(detectionRequested)}</code>
            {cfg.language_confidence_threshold !== undefined && (
              <>
                {" "}· confidence_threshold:{" "}
                <code className="font-mono">{String(cfg.language_confidence_threshold)}</code>
              </>
            )}
          </div>
        </div>

        {/* Audio enhancement audit */}
        <AudioEnhancementAudit cfg={cfg} />
      </CardContent>
    </Card>
  );
}

function AudioEnhancementAudit({ cfg }: { cfg: Record<string, unknown> }) {
  const ae = cfg.audio_enhancement;
  const legacyApplied = cfg.audio_enhanced;

  let summary: string;
  let tone: "ok" | "skipped" | "failed" | "legacy" = "ok";

  if (ae && typeof ae === "object") {
    const a = ae as Record<string, unknown>;
    const eligible = !!a.eligible;
    const attempted = !!a.attempted;
    const applied = !!a.applied;
    const reason = String(a.reason ?? "");
    const measured = (a.measured ?? null) as Record<string, unknown> | null;
    const gainDb = measured && typeof measured.applied_gain_db === "number"
      ? (measured.applied_gain_db as number)
      : null;

    if (!eligible) {
      summary = `Not eligible — ${reason || "skipped by template"}`;
      tone = "skipped";
    } else if (!attempted) {
      summary = `Eligible, not attempted — ${reason || "unknown"}`;
      tone = "skipped";
    } else if (applied) {
      const gainStr = gainDb != null && Number.isFinite(gainDb)
        ? ` (${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(1)} dB)`
        : "";
      summary = `Eligible, attempted, applied${gainStr}`;
      tone = "ok";
    } else {
      summary = `Eligible, attempted, not applied — ${reason || "unknown"}`;
      tone = reason === "failed" ? "failed" : "skipped";
    }
  } else if (legacyApplied !== undefined) {
    summary = `Legacy field: audio_enhanced=${String(legacyApplied)} (pre-runtime-metadata job)`;
    tone = "legacy";
  } else {
    summary = "No audio enhancement metadata recorded";
    tone = "skipped";
  }

  const toneClasses: Record<typeof tone, string> = {
    ok: "border-primary/40 bg-primary/5",
    skipped: "border-border bg-muted/30",
    failed: "border-destructive/50 bg-destructive/10",
    legacy: "border-amber-500/40 bg-amber-500/5",
  };

  return (
    <div className={cn("rounded-lg border p-3 space-y-1", toneClasses[tone])}>
      <h4 className="text-sm font-semibold">Audio enhancement</h4>
      <p className="text-xs text-muted-foreground">{summary}</p>
    </div>
  );
}

function Fact({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("truncate", mono && "font-mono text-xs")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function LangPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-col rounded-md border px-2.5 py-1",
        highlight ? "border-destructive/60 bg-destructive/10" : "bg-background",
      )}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}
