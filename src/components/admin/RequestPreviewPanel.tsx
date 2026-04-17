import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye } from "lucide-react";
import {
  buildPreviewPayload,
  TranscribeTemplateConfig,
} from "@/lib/transcribe-template";

interface Props {
  /** The current draft config from the editor (live, including unsaved edits). */
  config: TranscribeTemplateConfig;
}

/**
 * Read-only preview of the exact JSON body the transcribe edge function
 * would POST to AssemblyAI right now, computed from the current draft +
 * a fixed sample job (route=diarization, language=auto).
 *
 * This mirrors `buildTranscriptPayload` in
 * `supabase/functions/transcribe/index.ts` via the shared helper in
 * `src/lib/transcribe-template.ts`. The `audio_url` is a placeholder
 * because the real signed URL is created at request time.
 */
export default function RequestPreviewPanel({ config }: Props) {
  const [copied, setCopied] = useState(false);

  const payload = useMemo(
    () => buildPreviewPayload(config, { route: "diarization", language: "auto" }),
    [config],
  );

  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Payload copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">
                Last AssemblyAI request preview
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                Read-only
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Exact JSON body that would be POSTed to{" "}
              <code className="text-[11px]">{config.base_url}/transcript</code>{" "}
              right now, using the current draft. Sample:{" "}
              <span className="font-medium">route=diarization</span>,{" "}
              <span className="font-medium">language=auto</span>. The{" "}
              <code className="text-[11px]">audio_url</code> is a placeholder —
              the real signed URL is generated at request time.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <Copy className="w-4 h-4" />
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 overflow-auto max-h-96 font-mono leading-relaxed">
          {json}
        </pre>
      </CardContent>
    </Card>
  );
}
