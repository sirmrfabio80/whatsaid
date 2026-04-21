import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Download } from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { CanonicalExportData } from "@/lib/export-types";
import { buildTxt } from "@/lib/export-txt";
import { buildJson } from "@/lib/export-json";
import { buildDocxBlob } from "@/lib/export";
import { useNotifications } from "@/contexts/NotificationsContext";
import {
  hashExportData,
  readCache,
  writeCache,
  downloadBlob,
  type CacheableFormat,
} from "@/lib/export-cache";

type ExportFormat = CacheableFormat | "pdf";

interface ExportButtonProps { data: CanonicalExportData | null; disabled?: boolean; sourceJobId?: string; }

const MIME: Record<CacheableFormat, string> = {
  txt: "text/plain;charset=utf-8",
  json: "application/json",
  doc: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXT: Record<CacheableFormat, string> = {
  txt: "txt",
  json: "json",
  doc: "docx",
};

export default function ExportButton({ data, disabled, sourceJobId }: ExportButtonProps) {
  const { t } = useTranslation();
  const { startPdfExport } = useNotifications();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const isDisabled = disabled || !data || !data.transcript;

  const handleExport = async (format: ExportFormat) => {
    if (!data) return;

    // PDF is handled as an async job via NotificationsContext (already
    // deduplicated through `share_pdf_cache` on the share path).
    if (format === "pdf") {
      startPdfExport(data, sourceJobId);
      return;
    }

    setExporting(format);
    try {
      // Dedup: hash payload, reuse the previously-built Blob for the same
      // (jobId, format, hash) so repeated downloads don't re-run the
      // (potentially expensive) DOCX builder or re-serialise large
      // transcripts. Cache key is per-tab and bounded (see export-cache.ts).
      const cacheKeyJobId = sourceJobId ?? "anon";
      const hash = await hashExportData(data);
      const filename = `${data.title}.${EXT[format]}`;

      const hit = readCache(cacheKeyJobId, format, hash);
      if (hit) {
        downloadBlob(hit.blob, hit.filename);
      } else {
        let blob: Blob;
        switch (format) {
          case "txt":
            blob = new Blob([buildTxt(data)], { type: MIME.txt });
            break;
          case "json":
            blob = new Blob([buildJson(data)], { type: MIME.json });
            break;
          case "doc":
            blob = await buildDocxBlob(data);
            break;
        }
        writeCache(cacheKeyJobId, format, hash, blob, filename);
        downloadBlob(blob, filename);
      }
      toast.success(t("exportBtn.exportComplete"));
    } catch { toast.error(t("exportBtn.exportFailed")); } finally { setExporting(null); }
  };

  const formats: { key: ExportFormat; label: string; ext: string }[] = [
    { key: "txt", label: "TXT", ext: ".txt" },
    { key: "json", label: "JSON", ext: ".json" },
    { key: "doc", label: "DOC", ext: ".doc" },
    { key: "pdf", label: "PDF", ext: ".pdf" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-1.5 text-xs h-8" disabled={isDisabled}>
          {exporting ? <InlineSpinner size="xs" /> : <FileDown className="w-3.5 h-3.5" />}
          {t("exportBtn.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {formats.map((f) => (
          <DropdownMenuItem key={f.key} onClick={() => handleExport(f.key)} disabled={!!exporting}>
            <Download className="w-3.5 h-3.5 mr-2" />{f.label} ({f.ext})
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
