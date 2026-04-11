import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

interface ExportPayload {
  fileName: string;
  language: string | null;
  durationSeconds: number | null;
  createdAt: string | null;
  transcript: string | null;
  summary: string | null;
  customPrompt: string | null;
  customOutput: string | null;
}

function buildSections(p: ExportPayload): Paragraph[] {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: p.fileName, bold: true })],
    })
  );

  // Metadata line
  const metaParts: string[] = [];
  if (p.createdAt) metaParts.push(`Date: ${new Date(p.createdAt).toLocaleDateString()}`);
  if (p.language) metaParts.push(`Language: ${p.language}`);
  if (p.durationSeconds != null) {
    const m = Math.floor(p.durationSeconds / 60);
    const s = Math.floor(p.durationSeconds % 60);
    metaParts.push(`Duration: ${m}:${s.toString().padStart(2, "0")}`);
  }
  if (metaParts.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: metaParts.join("  •  "), color: "666666", size: 20 })],
      })
    );
  }

  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Transcript
  if (p.transcript) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Transcript", bold: true })],
      })
    );
    p.transcript.split("\n").forEach((line) => {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(line)] }));
    });
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Summary
  if (p.summary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Summary", bold: true })],
      })
    );
    p.summary.split("\n").forEach((line) => {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(line)] }));
    });
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Custom output
  if (p.customOutput) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "AI Output", bold: true })],
      })
    );
    if (p.customPrompt) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "Prompt: ", bold: true, italics: true, color: "666666" }),
            new TextRun({ text: p.customPrompt, italics: true, color: "666666" }),
          ],
        })
      );
    }
    p.customOutput.split("\n").forEach((line) => {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(line)] }));
    });
  }

  return children;
}

export async function exportDocx(payload: ExportPayload): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 24 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: buildSections(payload),
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  downloadBlob(buffer, `${baseName(payload.fileName)}.docx`);
}

export async function exportPdf(payload: ExportPayload): Promise<void> {
  // Build a print-friendly HTML document and use the browser's print-to-PDF
  const html = buildPdfHtml(payload);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  // Give the browser a moment to render, then trigger print
  setTimeout(() => printWindow.print(), 400);
}

function buildPdfHtml(p: ExportPayload): string {
  const metaParts: string[] = [];
  if (p.createdAt) metaParts.push(`Date: ${new Date(p.createdAt).toLocaleDateString()}`);
  if (p.language) metaParts.push(`Language: ${p.language}`);
  if (p.durationSeconds != null) {
    const m = Math.floor(p.durationSeconds / 60);
    const s = Math.floor(p.durationSeconds % 60);
    metaParts.push(`Duration: ${m}:${s.toString().padStart(2, "0")}`);
  }

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let body = `<h1 style="margin:0 0 4px;font-size:22px">${escape(p.fileName)}</h1>`;
  if (metaParts.length) body += `<p style="color:#666;font-size:12px;margin:0 0 20px">${metaParts.join("  •  ")}</p>`;

  if (p.transcript) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">Transcript</h2>`;
    body += `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${escape(p.transcript)}</div>`;
  }
  if (p.summary) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">Summary</h2>`;
    body += `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${escape(p.summary)}</div>`;
  }
  if (p.customOutput) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">AI Output</h2>`;
    if (p.customPrompt) {
      body += `<p style="color:#666;font-size:12px;font-style:italic;margin:0 0 8px">Prompt: ${escape(p.customPrompt)}</p>`;
    }
    body += `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${escape(p.customOutput)}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(p.fileName)}</title>
<style>@media print{@page{margin:1in}body{margin:0}}body{font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a}</style>
</head><body>${body}</body></html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "output";
}
