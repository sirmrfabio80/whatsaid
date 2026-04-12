import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, LevelFormat } from "docx";

import type { CanonicalExportData } from "./export-types";

export type { QAEntry, ExportPayload, CanonicalExportData } from "./export-types";

/* ------------------------------------------------------------------ */
/*  Markdown helpers                                                   */
/* ------------------------------------------------------------------ */

/** Convert inline markdown (bold, italic) into TextRun[] for DOCX */
function markdownToTextRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun(line.slice(lastIndex, match.index)));
    }
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
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
function markdownToDocxParagraphs(text: string, bulletRef: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split("\n");

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 160, after: 80 },
          children: markdownToTextRuns(line.slice(4)),
        }),
      );
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          children: markdownToTextRuns(line.slice(3)),
        }),
      );
      continue;
    }

    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);
    if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: bulletRef, level: 0 },
          spacing: { after: 60 },
          children: markdownToTextRuns(bulletMatch[1]),
        }),
      );
      continue;
    }

    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }

    paragraphs.push(
      new Paragraph({
        spacing: { after: 100 },
        children: markdownToTextRuns(line),
      }),
    );
  }

  return paragraphs;
}

/* ------------------------------------------------------------------ */
/*  DOCX export (consumes CanonicalExportData)                         */
/* ------------------------------------------------------------------ */

const BULLET_REF = "exportBullets";

function buildSections(data: CanonicalExportData): Paragraph[] {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: data.title, bold: true })],
    }),
  );

  // Metadata
  const metaParts: string[] = [];
  metaParts.push(`Date: ${data.createdAt}`);
  if (data.duration) metaParts.push(`Duration: ${data.duration}`);
  if (data.language) metaParts.push(`Language: ${data.language}`);
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: metaParts.join("  •  "), color: "666666", size: 20 })],
    }),
  );

  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Summary
  if (data.summary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Summary", bold: true })],
      }),
    );
    children.push(...markdownToDocxParagraphs(data.summary, BULLET_REF));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Questions & Answers (page break)
  if (data.questions && data.questions.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Questions & Answers", bold: true })],
      }),
    );

    data.questions.forEach((qa, i) => {
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
          }),
        );
      }
      children.push(...markdownToDocxParagraphs(qa.answer, BULLET_REF));
    });
  }

  // Transcript (page break)
  if (data.transcript) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Transcript", bold: true })],
      }),
    );
    data.transcript.split("\n").forEach((line) => {
      const speakerMatch = line.match(/^(.+?):\s/);
      if (speakerMatch) {
        const label = speakerMatch[1] + ":";
        const rest = line.slice(speakerMatch[0].length);
        children.push(
          new Paragraph({
            keepLines: true,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: label + " ", bold: true }),
              new TextRun(rest),
            ],
          }),
        );
      } else {
        children.push(new Paragraph({ keepLines: true, spacing: { after: 100 }, children: [new TextRun(line)] }));
      }
    });
  }

  return children;
}

export async function exportDocx(data: CanonicalExportData): Promise<void> {
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
        children: buildSections(data),
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  downloadBlob(buffer, `${data.title}.docx`);
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
