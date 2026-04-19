import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Eye, Globe } from "lucide-react";
import {
  buildPreviewPayload,
  resolveBaseUrl,
  TranscribeTemplateConfig,
} from "@/lib/transcribe-template";

interface Props {
  /** The current draft config from the editor (live, including unsaved edits). */
  config: TranscribeTemplateConfig;
}

type SampleCountry = "auto" | "US" | "EU";

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
  const [sampleCountry, setSampleCountry] = useState<SampleCountry>("auto");
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
        country: sampleCountry === "auto" ? undefined : sampleCountry,
      }),
    [config, sampleCountry],
  );

  const resolvedBaseUrl = useMemo(
    () =>
      resolveBaseUrl(
        config,
        sampleCountry === "auto" ? null : sampleCountry,
      ),
    [config, sampleCountry],
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Sample country</Label>
            <Select
              value={sampleCountry}
              onValueChange={(v) => setSampleCountry(v as SampleCountry)}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (no header)</SelectItem>
                <SelectItem value="US">US</SelectItem>
                <SelectItem value="EU">EU (any non-US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="shrink-0">Resolved endpoint:</span>
              <code className="text-[11px] truncate font-mono">
                {resolvedBaseUrl}/transcript
              </code>
              {config.geo_routing_enabled ? (
                <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                  Geo-routing ON
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                  Geo-routing OFF
                </Badge>
              )}
            </div>
          </div>
        </div>
        <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 overflow-auto max-h-96 font-mono leading-relaxed whitespace-pre-wrap break-words max-w-full">
          {json}
        </pre>
      </CardContent>
    </Card>
  );
}
