import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, LevelFormat } from "docx";

export interface QAEntry {
  prompt: string | null;
  answer: string;
}

interface ExportPayload {
  fileName: string;
  language: string | null;
  durationSeconds: number | null;
  createdAt: string | null;
  transcript: string | null;
  summary: string | null;
  customPrompt: string | null;
  customOutput: string | null;
  questions?: QAEntry[];
}

/* ------------------------------------------------------------------ */
/*  Markdown helpers                                                   */
/* ------------------------------------------------------------------ */

/** Convert inline markdown (bold, italic) into TextRun[] for DOCX */
function markdownToTextRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  // Regex for **bold**, *italic*, ***bold+italic***
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      runs.push(new TextRun(line.slice(lastIndex, match.index)));
    }
    if (match[2]) {
      // ***bold+italic***
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      // **bold**
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      // *italic*
      runs.push(new TextRun({ text: match[4], italics: true }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    runs.push(new TextRun(line.slice(lastIndex)));
  }
  if (runs.length === 0) {
    runs.push(new TextRun(line));
  }
  return runs;
}

/** Parse markdown text into DOCX paragraphs with basic formatting */
function markdownToDocxParagraphs(
  text: string,
  bulletRef: string
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split("\n");

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Heading lines (### H3, ## H2 — skip H1 since that's the doc title)
    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 160, after: 80 },
          children: markdownToTextRuns(line.slice(4)),
        })
      );
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          children: markdownToTextRuns(line.slice(3)),
        })
      );
      continue;
    }

    // Bullet list items (- item or * item)
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);
    if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: bulletRef, level: 0 },
          spacing: { after: 60 },
          children: markdownToTextRuns(bulletMatch[1]),
        })
      );
      continue;
    }

    // Empty line → spacing paragraph
    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(
      new Paragraph({
        spacing: { after: 100 },
        children: markdownToTextRuns(line),
      })
    );
  }

  return paragraphs;
}

/** Convert simple markdown to HTML for PDF export */
function markdownToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Close list if we're not on a bullet line
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);
    if (!bulletMatch && inList) {
      htmlParts.push("</ul>");
      inList = false;
    }

    // Headings
    if (line.startsWith("### ")) {
      htmlParts.push(`<h4 style="font-size:14px;margin:12px 0 4px;font-weight:bold">${inlineMarkdownToHtml(escape(line.slice(4)))}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      htmlParts.push(`<h3 style="font-size:15px;margin:16px 0 6px;font-weight:bold">${inlineMarkdownToHtml(escape(line.slice(3)))}</h3>`);
      continue;
    }

    // Bullet
    if (bulletMatch) {
      if (!inList) {
        htmlParts.push('<ul style="margin:4px 0 4px 20px;padding:0">');
        inList = true;
      }
      htmlParts.push(`<li style="font-size:13px;line-height:1.6;margin:2px 0">${inlineMarkdownToHtml(escape(bulletMatch[1]))}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      htmlParts.push("<br/>");
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p style="font-size:13px;line-height:1.6;margin:4px 0">${inlineMarkdownToHtml(escape(line))}</p>`);
  }

  if (inList) htmlParts.push("</ul>");
  return htmlParts.join("\n");
}

/** Convert inline bold/italic markdown to HTML (operates on already-escaped text) */
function inlineMarkdownToHtml(escaped: string): string {
  // ***bold+italic*** → <b><i>...</i></b>
  let result = escaped.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");
  // **bold** → <b>...</b>
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // *italic* → <i>...</i>
  result = result.replace(/\*(.+?)\*/g, "<i>$1</i>");
  return result;
}

/* ------------------------------------------------------------------ */
/*  DOCX export                                                        */
/* ------------------------------------------------------------------ */

const BULLET_REF = "exportBullets";

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

  // Transcript (plain text — no markdown)
  if (p.transcript) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Transcript", bold: true })],
      })
    );
    p.transcript.split("\n").forEach((line) => {
      const speakerMatch = line.match(/^(.+?):\s/);
      if (speakerMatch) {
        const label = speakerMatch[1] + ":";
        const rest = line.slice(speakerMatch[0].length);
        children.push(new Paragraph({ spacing: { after: 100 }, children: [
          new TextRun({ text: label + " ", bold: true }),
          new TextRun(rest),
        ] }));
      } else {
        children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(line)] }));
      }
    });
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Summary (markdown-aware)
  if (p.summary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Summary", bold: true })],
      })
    );
    children.push(...markdownToDocxParagraphs(p.summary, BULLET_REF));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Custom output (markdown-aware)
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
    children.push(...markdownToDocxParagraphs(p.customOutput, BULLET_REF));
  }

  // Questions & Answers appendix (markdown-aware)
  if (p.questions && p.questions.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Questions & Answers", bold: true })],
      })
    );

    p.questions.forEach((qa, i) => {
      if (i > 0) {
        children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      }
      if (qa.prompt) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Q: ", bold: true }),
              new TextRun({ text: qa.prompt, bold: true }),
            ],
          })
        );
      }
      children.push(...markdownToDocxParagraphs(qa.answer, BULLET_REF));
    });
  }

  return children;
}

export async function exportDocx(payload: ExportPayload): Promise<void> {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
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

/* ------------------------------------------------------------------ */
/*  PDF export                                                         */
/* ------------------------------------------------------------------ */

export async function exportPdf(payload: ExportPayload): Promise<void> {
  const title = baseName(payload.fileName);
  const html = buildPdfHtml(payload);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  const triggerPrint = () => {
    // Force title right before print so browser uses it as suggested filename
    printWindow.document.title = title;
    printWindow.focus();
    setTimeout(() => {
      printWindow.document.title = title;
      printWindow.print();
    }, 150);
  };

  if (printWindow.document.readyState === "complete") {
    triggerPrint();
    return;
  }

  printWindow.addEventListener("load", triggerPrint, { once: true });
  setTimeout(triggerPrint, 500);
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
  const title = baseName(p.fileName);

  let body = `<h1 style="margin:0 0 4px;font-size:22px">${escape(title)}</h1>`;
  if (metaParts.length) body += `<p style="color:#666;font-size:12px;margin:0 0 20px">${metaParts.join("  •  ")}</p>`;

  // Transcript — plain text
  if (p.transcript) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">Transcript</h2>`;
    const transcriptHtml = p.transcript.split("\n").map((line) => {
      const speakerMatch = line.match(/^(.+?):\s/);
      if (speakerMatch) {
        const label = escape(speakerMatch[1] + ":");
        const rest = escape(line.slice(speakerMatch[0].length));
        return `<p style="margin:0 0 6px"><strong>${label}</strong> ${rest}</p>`;
      }
      return `<p style="margin:0 0 6px">${escape(line)}</p>`;
    }).join("");
    body += `<div style="font-size:13px;line-height:1.6">${transcriptHtml}</div>`;
  }

  // Summary — rendered markdown
  if (p.summary) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">Summary</h2>`;
    body += `<div style="font-size:13px;line-height:1.6">${markdownToHtml(p.summary)}</div>`;
  }

  // Custom output — rendered markdown
  if (p.customOutput) {
    body += `<h2 style="font-size:16px;margin:24px 0 8px">AI Output</h2>`;
    if (p.customPrompt) {
      body += `<p style="color:#666;font-size:12px;font-style:italic;margin:0 0 8px">Prompt: ${escape(p.customPrompt)}</p>`;
    }
    body += `<div style="font-size:13px;line-height:1.6">${markdownToHtml(p.customOutput)}</div>`;
  }

  // Questions & Answers — rendered markdown
  if (p.questions && p.questions.length > 0) {
    body += `<div style="page-break-before:always"></div>`;
    body += `<h2 style="font-size:16px;margin:24px 0 8px">Questions &amp; Answers</h2>`;
    p.questions.forEach((qa) => {
      if (qa.prompt) {
        body += `<p style="font-weight:bold;font-size:13px;margin:16px 0 4px">Q: ${escape(qa.prompt)}</p>`;
      }
      body += `<div style="font-size:13px;line-height:1.6;margin:0 0 12px">${markdownToHtml(qa.answer)}</div>`;
    });
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>@media print{@page{margin:1in}body{margin:0}}body{font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a}ul{margin:4px 0 4px 20px}li{margin:2px 0}</style>
</head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

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
