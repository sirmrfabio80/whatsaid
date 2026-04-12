import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { CanonicalExportData } from "@/lib/export-types";
import { buildTxt } from "@/lib/export-txt";
import { buildJson } from "@/lib/export-json";
import { exportDocx } from "@/lib/export";
import { exportPdf } from "@/lib/export-pdf";

type ExportFormat = "txt" | "json" | "doc" | "pdf";

interface ExportButtonProps { data: CanonicalExportData | null; disabled?: boolean; }

function downloadString(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function ExportButton({ data, disabled }: ExportButtonProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const isDisabled = disabled || !data || !data.transcript;

  const handleExport = async (format: ExportFormat) => {
    if (!data) return;
    setExporting(format);
    try {
      switch (format) {
        case "txt": downloadString(buildTxt(data), `${data.title}.txt`, "text/plain;charset=utf-8"); break;
        case "json": downloadString(buildJson(data), `${data.title}.json`, "application/json"); break;
        case "doc": await exportDocx(data); break;
        case "pdf": await exportPdf(data); break;
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
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
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
