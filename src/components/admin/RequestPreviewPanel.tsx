import { useMemo } from "react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, Globe } from "lucide-react";
import {
  buildPreviewPayload,
  ASSEMBLYAI_EU_BASE_URL,
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
 * AssemblyAI is EU-only — the endpoint is fixed.
 */
export default function RequestPreviewPanel({ config }: Props) {
  const { copied, copy } = useCopyToClipboard({
    successMessage: "Payload copied",
    errorMessage: "Copy failed",
    resetMs: 1500,
  });

  const payload = useMemo(
    () =>
      buildPreviewPayload(config, {
        route: "diarization",
        language: "auto",
      }),
    [config],
  );

  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const handleCopy = () => copy(json);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-h3">
                Last AssemblyAI request preview
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                Read-only
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Exact JSON body that would be POSTed using the current draft.
              Sample: <span className="font-medium">route=diarization</span>,{" "}
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
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="shrink-0">Endpoint:</span>
            <code className="text-[11px] truncate font-mono">
              {ASSEMBLYAI_EU_BASE_URL}/transcript
            </code>
            <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
              Region: EU (locked)
            </Badge>
          </div>
        </div>
        <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 overflow-auto max-h-96 font-mono leading-relaxed whitespace-pre-wrap break-words max-w-full">
          {json}
        </pre>
      </CardContent>
    </Card>
  );
}
