import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, LevelFormat } from "docx";

import { exportPdf as exportPdfDocument } from "./export-pdf";
import type { ExportPayload } from "./export-types";

export type { QAEntry, ExportPayload } from "./export-types";

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
  await exportPdfDocument(payload);
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
