import { jsPDF } from "jspdf";
import logoUrl from "@/assets/logo.png";
import ss4RegularUrl from "@/assets/fonts/SourceSerif4-Regular.ttf?url";
import ss4BoldUrl from "@/assets/fonts/SourceSerif4-Bold.ttf?url";
import ss4ItalicUrl from "@/assets/fonts/SourceSerif4-Italic.ttf?url";
import ss4BoldItalicUrl from "@/assets/fonts/SourceSerif4-BoldItalic.ttf?url";
import type { CanonicalExportData } from "./export-types";

/* ------------------------------------------------------------------ */
/*  Logo cache                                                         */
/* ------------------------------------------------------------------ */

let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const resp = await fetch(logoUrl);
    const blob = await resp.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        _logoDataUrl = reader.result as string;
        resolve(_logoDataUrl);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    console.warn("Could not load logo for PDF footer");
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Source Serif 4 font cache (for reading surfaces)                   */
/* ------------------------------------------------------------------ */

/** jsPDF font name registered for Source Serif 4 (matches in-app reading font) */
const SERIF_FONT = "SourceSerif4";
/** Sans fallback used for chrome (titles, metadata, footers, transcript timestamps) */
const SANS_FONT = "helvetica";

interface Ss4Cache {
  regular: string;
  bold: string;
  italic: string;
  bolditalic: string;
}
let _ss4Cache: Ss4Cache | null = null;
let _ss4Promise: Promise<Ss4Cache | null> | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch font: ${url}`);
  const buf = await resp.arrayBuffer();
  // Convert to base64 in chunks to avoid call stack overflow on large fonts
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

async function loadSourceSerif4(): Promise<Ss4Cache | null> {
  if (_ss4Cache) return _ss4Cache;
  if (_ss4Promise) return _ss4Promise;
  _ss4Promise = (async () => {
    try {
      const [regular, bold, italic, bolditalic] = await Promise.all([
        fetchAsBase64(ss4RegularUrl),
        fetchAsBase64(ss4BoldUrl),
        fetchAsBase64(ss4ItalicUrl),
        fetchAsBase64(ss4BoldItalicUrl),
      ]);
      _ss4Cache = { regular, bold, italic, bolditalic };
      return _ss4Cache;
    } catch (e) {
      console.warn("Could not load Source Serif 4 for PDF — falling back to Helvetica", e);
      return null;
    }
  })();
  return _ss4Promise;
}

function registerSerifFont(pdf: jsPDF, cache: Ss4Cache) {
  pdf.addFileToVFS("SourceSerif4-Regular.ttf", cache.regular);
  pdf.addFont("SourceSerif4-Regular.ttf", SERIF_FONT, "normal");
  pdf.addFileToVFS("SourceSerif4-Bold.ttf", cache.bold);
  pdf.addFont("SourceSerif4-Bold.ttf", SERIF_FONT, "bold");
  pdf.addFileToVFS("SourceSerif4-Italic.ttf", cache.italic);
  pdf.addFont("SourceSerif4-Italic.ttf", SERIF_FONT, "italic");
  pdf.addFileToVFS("SourceSerif4-BoldItalic.ttf", cache.bolditalic);
  pdf.addFont("SourceSerif4-BoldItalic.ttf", SERIF_FONT, "bolditalic");
}

/* ------------------------------------------------------------------ */
/*  Layout & typography tokens                                         */
/* ------------------------------------------------------------------ */

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 15;
const MR = 15;
const MT = 15;
const FOOTER_H = 14;
const CW = PAGE_W - ML - MR;
const MAX_Y = PAGE_H - FOOTER_H;

/** Font sizes in pt — calibrated for readable mobile PDF viewing */
const F = {
  h1: 27, h2: 18, h3: 16, h4: 15,
  body: 13, bullet: 13, qa: 13,
  transcript: 12, timestamp: 10, meta: 11,
} as const;

const LH = 1.65;
const HLH = 1.35;

/** Colours */
const C = {
  heading: "#111827",
  body: "#1f2937",
  timestamp: "#9ca3af",
  meta: "#6b7280",
  accent: "#6366f1",
  transcriptBg: "#f8f9fa",
} as const;

const SPEAKER_COLORS = [
  "#6366f1", "#0891b2", "#16a34a", "#d97706", "#dc2626",
  "#9333ea", "#0d9488", "#c026d3", "#2563eb", "#ea580c",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ptMm(pt: number): number {
  return pt * 25.4 / 72;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/* ------------------------------------------------------------------ */
/*  Inline markdown parser                                             */
/* ------------------------------------------------------------------ */

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

function parseInline(s: string): TextRun[] {
  const runs: TextRun[] = [];
  const rx = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let li = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    if (m.index > li) runs.push({ text: s.slice(li, m.index) });
    if (m[2]) runs.push({ text: m[2], bold: true, italic: true });
    else if (m[3]) runs.push({ text: m[3], bold: true });
    else if (m[4]) runs.push({ text: m[4], italic: true });
    li = rx.lastIndex;
  }
  if (li < s.length) runs.push({ text: s.slice(li) });
  if (runs.length === 0) runs.push({ text: s });
  return runs;
}

interface FmtWord {
  text: string;
  bold: boolean;
  italic: boolean;
}

function runsToWords(runs: TextRun[]): FmtWord[] {
  const words: FmtWord[] = [];
  for (const r of runs) {
    for (const t of r.text.split(/\s+/)) {
      if (t) words.push({ text: t, bold: !!r.bold, italic: !!r.italic });
    }
  }
  return words;
}

/* ------------------------------------------------------------------ */
/*  PDF text renderer                                                  */
/* ------------------------------------------------------------------ */

class Pen {
  pdf: jsPDF;
  y = MT;
  serifAvailable: boolean;

  constructor(pdf: jsPDF, serifAvailable: boolean) {
    this.pdf = pdf;
    this.serifAvailable = serifAvailable;
  }

  private setF(bold: boolean, italic: boolean, sz: number, useSerif = false) {
    const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
    const family = useSerif && this.serifAvailable ? SERIF_FONT : SANS_FONT;
    this.pdf.setFont(family, style);
    this.pdf.setFontSize(sz);
  }

  private setC(hex: string) {
    this.pdf.setTextColor(...hexRgb(hex));
  }

  private baseline(fontSize: number): number {
    return this.y + ptMm(fontSize) * 0.78;
  }

  pageBreak(need: number) {
    if (this.y + need > MAX_Y) {
      this.pdf.addPage();
      this.y = MT;
    }
  }

  /**
   * Force a page break if `need` mm cannot fit in the remaining page space.
   * Same logic as pageBreak but named to make "keep-with-next" intent explicit
   * at call sites (see renderMarkdown / sectionHeading).
   */
  pageBreakHard(need: number) {
    if (this.y + need > MAX_Y) {
      this.pdf.addPage();
      this.y = MT;
    }
  }

  /**
   * Measure the rendered height (mm) of a single body/bullet/plain markdown line
   * using the same wrapping path as plain()/rich(). Pure measurement — no draw,
   * no y mutation, no page break.
   */
  measureLine(line: string): number {
    const trimmed = line.trimEnd();
    if (trimmed.trim() === "") return 2; // gap()
    const isBullet = /^\s*[-*]\s+/.test(trimmed);
    const text = isBullet ? trimmed.replace(/^\s*[-*]\s+/, "") : trimmed;
    // Strip inline markdown markers for width measurement (close enough; bold
    // is slightly wider but the 2-line lookahead is a heuristic, not exact).
    const plainText = text.replace(/\*+/g, "");
    const fontSize = isBullet ? F.bullet : F.body;
    const maxW = isBullet ? CW - 7 : CW;
    const lineH = ptMm(fontSize) * LH;
    this.setF(false, false, fontSize);
    const wrapped: string[] = this.pdf.splitTextToSize(plainText, maxW);
    return Math.max(1, wrapped.length) * lineH;
  }

  newPage() {
    if (this.y > MT + 1) {
      this.pdf.addPage();
      this.y = MT;
    }
  }

  gap(mm: number) {
    this.y += mm;
  }

  /** Render rich text with inline bold/italic and word wrapping */
  rich(
    runs: TextRun[],
    fontSize: number,
    color: string,
    x = ML,
    maxW = CW,
    lhMul = LH,
    useSerif = false,
  ): number {
    const words = runsToWords(runs);
    if (!words.length) return 0;

    const lineH = ptMm(fontSize) * lhMul;
    this.setF(false, false, fontSize, useSerif);
    const spaceW = this.pdf.getTextWidth(" ");

    // Word-wrap into lines
    const lines: FmtWord[][] = [];
    let curLine: FmtWord[] = [];
    let curW = 0;

    for (const w of words) {
      this.setF(w.bold, w.italic, fontSize, useSerif);
      const ww = this.pdf.getTextWidth(w.text);
      const need = curLine.length ? spaceW + ww : ww;
      if (curW + need > maxW && curLine.length) {
        lines.push(curLine);
        curLine = [w];
        curW = ww;
      } else {
        curLine.push(w);
        curW += need;
      }
    }
    if (curLine.length) lines.push(curLine);

    // Render each line
    let totalH = 0;
    for (const ln of lines) {
      this.pageBreak(lineH);
      let cx = x;
      const bl = this.baseline(fontSize);
      for (let i = 0; i < ln.length; i++) {
        this.setF(ln[i].bold, ln[i].italic, fontSize, useSerif);
        this.setC(color);
        this.pdf.text(ln[i].text, cx, bl);
        cx += this.pdf.getTextWidth(ln[i].text);
        if (i < ln.length - 1) cx += spaceW;
      }
      this.y += lineH;
      totalH += lineH;
    }
    return totalH;
  }

  /** Render plain text (single style) — fastest path */
  plain(
    text: string,
    fontSize: number,
    color: string,
    bold = false,
    italic = false,
    x = ML,
    maxW = CW,
    lhMul = LH,
    useSerif = false,
  ): number {
    const lineH = ptMm(fontSize) * lhMul;
    this.setF(bold, italic, fontSize, useSerif);
    this.setC(color);
    const lines: string[] = this.pdf.splitTextToSize(text, maxW);
    let totalH = 0;
    for (const l of lines) {
      this.pageBreak(lineH);
      this.pdf.text(l, x, this.baseline(fontSize));
      this.y += lineH;
      totalH += lineH;
    }
    return totalH;
  }

  heading(text: string, level: 1 | 2 | 3 | 4) {
    const sz = [0, F.h1, F.h2, F.h3, F.h4][level];
    const before = level === 1 ? 0 : level === 2 ? 5 : 3;
    const after = level === 1 ? 3 : 2;
    this.y += before;
    // Headings stay on sans (chrome) for visual separation from reading body.
    this.plain(text, sz, C.heading, true, false, ML, CW, HLH, false);
    this.y += after;
  }

  sectionHeading(text: string, firstBodyHeightMm = 0) {
    // Reserve: divider gap (4mm) + heading height + first body block height
    const headingHeight = ptMm(F.h2) * HLH + 5 + 2; // before(5) + after(2)
    this.pageBreakHard(4 + headingHeight + firstBodyHeightMm);
    this.pdf.setDrawColor(...hexRgb(C.accent));
    this.pdf.setLineWidth(0.5);
    this.pdf.line(ML, this.y, PAGE_W - MR, this.y);
    this.y += 4;
    this.heading(text, 2);
  }

  bullet(text: string, useSerif = false) {
    const lineH = ptMm(F.bullet) * LH;
    this.pageBreak(lineH);
    this.setF(false, false, F.bullet, useSerif);
    this.setC(C.body);
    this.pdf.text("•", ML + 2, this.baseline(F.bullet));
    this.rich(parseInline(text), F.bullet, C.body, ML + 7, CW - 7, LH, useSerif);
  }

  /** Render a transcript speaker line with colored dot, timestamp, bold speaker, and wrapped text */
  speaker(
    timestamp: string | null,
    speakerName: string,
    text: string,
    dotColor: string,
  ) {
    const lineH = ptMm(F.transcript) * LH;
    this.pageBreak(lineH);
    let x = ML;

    // Colored dot
    this.pdf.setFillColor(...hexRgb(dotColor));
    this.pdf.circle(x + 1.5, this.y + ptMm(F.transcript) * 0.45, 1.2, "F");
    x += 5;

    // Timestamp
    if (timestamp) {
      this.pdf.setFont("courier", "normal");
      this.pdf.setFontSize(F.timestamp);
      this.setC(C.timestamp);
      this.pdf.text(timestamp, x, this.baseline(F.transcript));
      x += this.pdf.getTextWidth(timestamp) + 2;
    }

    // Speaker name (bold) — sans for clear chrome separation
    this.setF(true, false, F.transcript, false);
    this.setC(C.heading);
    const label = `${speakerName}: `;
    this.pdf.text(label, x, this.baseline(F.transcript));
    x += this.pdf.getTextWidth(label);

    // Body text — first line after prefix, subsequent lines wrap at ML+5.
    // Use serif for the actual transcript prose to match in-app reading.
    this.setF(false, false, F.transcript, true);
    this.setC(C.body);

    const firstMax = ML + CW - x;
    const wrapX = ML + 5;
    const wrapMax = CW - 5;

    // If prefix is too wide, start text on next line
    if (firstMax < 15) {
      this.y += lineH;
      this.plain(text, F.transcript, C.body, false, false, wrapX, wrapMax, LH, true);
      this.y += 0.5;
      return;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) {
      this.y += lineH;
      this.y += 0.5;
      return;
    }

    const sw = this.pdf.getTextWidth(" ");
    let lineWords: string[] = [];
    let lineW = 0;
    let isFirst = true;

    for (const word of words) {
      const ww = this.pdf.getTextWidth(word);
      const maxW = isFirst ? firstMax : wrapMax;
      const need = lineWords.length ? sw + ww : ww;

      if (lineW + need > maxW && lineWords.length) {
        // Flush current line
        const lineText = lineWords.join(" ");
        if (isFirst) {
          this.pdf.text(lineText, x, this.baseline(F.transcript));
          isFirst = false;
        } else {
          this.pdf.text(lineText, wrapX, this.baseline(F.transcript));
        }
        this.y += lineH;
        this.pageBreak(lineH);
        lineWords = [word];
        lineW = ww;
      } else {
        lineWords.push(word);
        lineW += need;
      }
    }

    // Flush remaining
    if (lineWords.length) {
      const lineText = lineWords.join(" ");
      if (isFirst) {
        this.pdf.text(lineText, x, this.baseline(F.transcript));
      } else {
        this.pdf.text(lineText, wrapX, this.baseline(F.transcript));
      }
      this.y += lineH;
    }

    this.y += 0.5;
  }

  /** Render a plain transcript line (no speaker match) — serif body */
  transcriptLine(text: string) {
    this.plain(text, F.transcript, C.body, false, false, ML + 5, CW - 5, LH, true);
  }

  /**
   * Render a horizontal row of "speaker chips" — a coloured dot followed by
   * the speaker name — flowing onto multiple lines if needed. Mirrors the
   * "Speakers:" pill row shown on the in-app transcript page so the PDF
   * header carries the same at-a-glance information.
   */
  speakerRow(speakers: string[], colors: Map<string, string>) {
    if (!speakers.length) return;

    const labelFont = F.meta;
    const chipFont = F.meta;
    const lineH = ptMm(chipFont) * LH;
    const rowGapY = 1.5;
    const dotR = 1.3;
    const dotGap = 1.8;
    const chipGap = 5;

    this.pageBreak(lineH);

    // Leading "Speakers:" label in the same muted meta colour as the row above.
    this.setF(true, false, labelFont, false);
    this.setC(C.meta);
    const label = "Speakers:";
    const labelW = this.pdf.getTextWidth(label);
    let x = ML;
    let bl = this.baseline(labelFont);
    this.pdf.text(label, x, bl);
    x += labelW + 3;

    // Names render in regular weight and the heading colour so the row reads
    // as content (not chrome), but stays visually grouped with the metadata.
    this.setF(false, false, chipFont, false);

    for (const spk of speakers) {
      const color = colors.get(spk.toLowerCase()) ?? C.accent;
      const nameW = this.pdf.getTextWidth(spk);
      const chipW = dotR * 2 + dotGap + nameW;

      // Wrap to a new row when the chip would overflow the content width.
      if (x + chipW > ML + CW) {
        this.y += lineH + rowGapY;
        this.pageBreak(lineH);
        x = ML + labelW + 3;
        bl = this.baseline(chipFont);
      }

      const dotY = this.y + ptMm(chipFont) * 0.55;
      this.pdf.setFillColor(...hexRgb(color));
      this.pdf.circle(x + dotR, dotY, dotR, "F");

      this.setC(C.heading);
      this.pdf.text(spk, x + dotR * 2 + dotGap, bl);
      x += chipW + chipGap;
    }

    this.y += lineH;
  }
}

/* ------------------------------------------------------------------ */
/*  Markdown → PDF rendering                                           */
/* ------------------------------------------------------------------ */

/**
 * Look ahead in `lines` starting at `startIdx` and return the total rendered
 * height (mm) of the next `count` non-empty, non-heading content lines.
 * Stops early at the next heading — that heading runs its own keep-with-next.
 */
function measureNextLines(pen: Pen, lines: string[], startIdx: number, count: number): number {
  let total = 0;
  let taken = 0;
  for (let i = startIdx; i < lines.length && taken < count; i++) {
    const l = lines[i].trimEnd();
    if (/^#{1,6}\s/.test(l)) break;
    if (l.trim() === "") continue;
    total += pen.measureLine(l);
    taken += 1;
  }
  return total;
}

function headingReserve(level: 1 | 2 | 3 | 4): number {
  const sz = [0, F.h1, F.h2, F.h3, F.h4][level];
  const before = level === 1 ? 0 : level === 2 ? 5 : 3;
  const after = level === 1 ? 3 : 2;
  return before + ptMm(sz) * HLH + after;
}

function renderMarkdown(pen: Pen, text: string, useSerif = true) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    let level: 1 | 2 | 3 | 4 | null = null;
    let headingText = "";
    if (/^####\s/.test(line)) { level = 4; headingText = line.slice(5); }
    else if (/^###\s/.test(line)) { level = 4; headingText = line.slice(4); }
    else if (/^##\s/.test(line)) { level = 3; headingText = line.slice(3); }
    else if (/^#\s/.test(line)) { level = 2; headingText = line.slice(2); }

    if (level !== null) {
      const need = headingReserve(level) + measureNextLines(pen, lines, i + 1, 2);
      pen.pageBreakHard(need);
      pen.heading(headingText, level);
    } else if (/^\s*[-*]\s+/.test(line)) {
      pen.bullet(line.replace(/^\s*[-*]\s+/, ""), useSerif);
    } else if (line.trim() === "") {
      pen.gap(2);
    } else {
      let nextContentIdx = i + 1;
      while (nextContentIdx < lines.length && lines[nextContentIdx].trim() === "") {
        nextContentIdx++;
      }
      const nextLine = nextContentIdx < lines.length ? lines[nextContentIdx].trimEnd() : "";
      if (/^\s*[-*]\s+/.test(nextLine)) {
        const paraH = pen.measureLine(line);
        const bulletH = pen.measureLine(nextLine);
        pen.pageBreakHard(paraH + bulletH);
      }
      pen.rich(parseInline(line), F.body, C.body, ML, CW, LH, useSerif);
    }
  }
}

/** Measure first N lines of a markdown block (used to gate sectionHeading). */
function measureMarkdownHead(pen: Pen, text: string, count: number): number {
  return measureNextLines(pen, text.split("\n"), 0, count);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function generatePdfBlob(data: CanonicalExportData): Promise<Blob> {
  const t0 = performance.now();

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({
    title: data.title,
    subject: "WhatSaid export",
    creator: "WhatSaid",
    author: "WhatSaid",
  });

  // Load Source Serif 4 (used for reading surfaces: summary, Q&A answers, transcript).
  // Falls back to Helvetica if loading fails so the export never breaks.
  const ss4 = await loadSourceSerif4();
  if (ss4) registerSerifFont(pdf, ss4);

  const pen = new Pen(pdf, !!ss4);

  // ── Header ──
  pen.heading(data.title, 1);
  const metaParts: string[] = [`Date: ${data.createdAt}`];
  if (data.duration) metaParts.push(`Duration: ${data.duration}`);
  if (data.language) metaParts.push(`Language: ${data.language}`);
  pen.plain(metaParts.join("  •  "), F.meta, C.meta);
  pen.gap(3);

  // ── Speakers (chip row, mirrors the colour assignment used in transcript) ──
  // Pre-compute speaker → colour so the chips at the top match the dots
  // shown next to each utterance further down. Lower-cased keys mirror the
  // matching done in the transcript renderer below.
  const speakerColorMap = new Map<string, string>();
  if (data.speakers && data.speakers.length) {
    for (const spk of data.speakers) {
      const key = spk.toLowerCase();
      if (!speakerColorMap.has(key)) {
        speakerColorMap.set(key, SPEAKER_COLORS[speakerColorMap.size % SPEAKER_COLORS.length]);
      }
    }
    pen.speakerRow(data.speakers, speakerColorMap);
    pen.gap(4);
  } else {
    pen.gap(1);
  }

  // ── Summary ──
  if (data.summary) {
    // Keep "Summary" heading with first 2 body lines.
    const need = headingReserve(2) + measureMarkdownHead(pen, data.summary, 2);
    pen.pageBreakHard(need);
    pen.heading("Summary", 2);
    renderMarkdown(pen, data.summary);
    pen.gap(4);
  }

  // ── Questions & Answers ──
  if (data.questions?.length) {
    pen.newPage();
    // Reserve Q&A heading + first prompt line + first 2 answer lines so the
    // section title never lands alone at the bottom of a page.
    const firstQa = data.questions[0];
    const qaPromptH = firstQa?.prompt ? ptMm(F.qa) * LH + 4 : 0;
    const qaAnswerH = firstQa?.answer ? measureMarkdownHead(pen, firstQa.answer, 2) : 0;
    pen.sectionHeading("Questions & Answers", qaPromptH + qaAnswerH);
    for (const qa of data.questions) {
      if (qa.prompt) {
        pen.gap(3);
        // Keep Q prompt with first 2 lines of its answer.
        const promptH = ptMm(F.qa) * LH;
        const answerH = qa.answer ? measureMarkdownHead(pen, qa.answer, 2) : 0;
        pen.pageBreakHard(promptH + 1 + answerH);
        // Q&A on the in-app page renders in the default sans body font, not
        // serif — match that here so the PDF feels like the same document.
        pen.rich(
          [{ text: "Q: ", bold: true }, { text: qa.prompt, bold: true }],
          F.qa,
          C.heading,
          ML,
          CW,
          LH,
          false,
        );
        pen.gap(1);
      }
      renderMarkdown(pen, qa.answer, false);
      pen.gap(3);
    }
  }

  // ── Transcript ──
  if (data.transcript) {
    pen.newPage();
    // Reserve heading + first 2 transcript lines (approx via line height).
    const firstTwoH = 2 * ptMm(F.transcript) * LH;
    pen.sectionHeading("Transcript", firstTwoH);

    // `speakerColorMap` is already initialised above (header chip row) so the
    // colour for each speaker stays identical between the chips and the dots.

    for (const line of data.transcript.split("\n")) {
      if (!line.trim()) {
        pen.gap(1);
        continue;
      }

      // [HH:MM:SS] Speaker: text
      const tsMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.+?):\s(.*)/);
      if (tsMatch) {
        const [, ts, spk, txt] = tsMatch;
        const key = spk.toLowerCase();
        if (!speakerColorMap.has(key))
          speakerColorMap.set(key, SPEAKER_COLORS[speakerColorMap.size % SPEAKER_COLORS.length]);
        pen.speaker(ts, spk, txt, speakerColorMap.get(key)!);
        continue;
      }

      // Speaker: text (no timestamp)
      const spkMatch = line.match(/^(.+?):\s(.*)/);
      if (spkMatch) {
        const [, spk, txt] = spkMatch;
        const key = spk.toLowerCase();
        if (!speakerColorMap.has(key))
          speakerColorMap.set(key, SPEAKER_COLORS[speakerColorMap.size % SPEAKER_COLORS.length]);
        pen.speaker(null, spk, txt, speakerColorMap.get(key)!);
        continue;
      }

      // Plain line
      pen.transcriptLine(line);
    }
  }

  // ── Footers ──
  const logoData = await getLogoDataUrl();
  const pageCount = pdf.getNumberOfPages();
  const WHATSAID_URL = "https://whatsaid.app";

  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    const footerY = PAGE_H - FOOTER_H + 6;

    // Divider line
    pdf.setDrawColor(209, 213, 219);
    pdf.setLineWidth(0.3);
    pdf.line(ML, footerY - 2, PAGE_W - MR, footerY - 2);

    // Logo
    const logoSize = 4;
    const logoY = footerY - 1;
    let textStartX = ML;
    if (logoData) {
      pdf.addImage(logoData, "PNG", ML, logoY, logoSize, logoSize, undefined, "FAST");
      textStartX = ML + logoSize + 1.5;
    }

    // Footer text
    const textY = logoY + logoSize / 2 + 1;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    const footerText = "Generated by WhatSaid  ·  whatsaid.app";
    pdf.text(footerText, textStartX, textY);
    const textWidth = pdf.getTextWidth(footerText);
    pdf.link(textStartX, logoY, textWidth, logoSize, { url: WHATSAID_URL });

    // Page number
    pdf.text(`${p} / ${pageCount}`, PAGE_W - MR, textY, { align: "right" });
  }

  console.info("[PDF perf]", {
    totalTimeMs: Math.round(performance.now() - t0),
    pages: pageCount,
  });

  return pdf.output("blob");
}

export async function exportPdf(data: CanonicalExportData): Promise<void> {
  const blob = await generatePdfBlob(data);
  downloadBlob(blob, `${data.title}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Content model (used by tests and external callers)                 */
/* ------------------------------------------------------------------ */

interface PdfBlock {
  html: string;
  forceNewPage: boolean;
  gapAfterMm: number;
}

/**
 * Build a structured list of content blocks from the export data.
 * Returns simplified text-based blocks (not HTML) for testing/inspection.
 */
export function buildPdfBlocks(data: CanonicalExportData): PdfBlock[] {
  const blocks: PdfBlock[] = [];

  // Header
  const meta = [`Date: ${data.createdAt}`];
  if (data.duration) meta.push(`Duration: ${data.duration}`);
  if (data.language) meta.push(`Language: ${data.language}`);
  blocks.push({
    html: `Title: ${data.title}\n${meta.join(" • ")}`,
    forceNewPage: false,
    gapAfterMm: 3,
  });

  // Speakers row (mirrors the chip strip on the in-app transcript page)
  if (data.speakers && data.speakers.length) {
    blocks.push({
      html: `Speakers: ${data.speakers.join(" · ")}`,
      forceNewPage: false,
      gapAfterMm: 3,
    });
  }

  // Summary
  if (data.summary) {
    blocks.push({
      html: `Summary\n${data.summary}`,
      forceNewPage: false,
      gapAfterMm: 3,
    });
  }

  // Q&A
  if (data.questions?.length) {
    blocks.push({
      html: "Questions & Answers",
      forceNewPage: true,
      gapAfterMm: 1,
    });
    for (const q of data.questions) {
      blocks.push({
        html: `Q: ${q.prompt}\n${q.answer}`,
        forceNewPage: false,
        gapAfterMm: 1,
      });
    }
  }

  // Transcript
  if (data.transcript) {
    blocks.push({
      html: `Transcript\n${data.transcript}`,
      forceNewPage: true,
      gapAfterMm: 0,
    });
  }

  return blocks;
}

export function buildPdfSections(data: CanonicalExportData): { html: string; forceNewPage: boolean }[] {
  return buildPdfBlocks(data).map((b) => ({ html: b.html, forceNewPage: b.forceNewPage }));
}

export function buildPdfDocumentHtml(data: CanonicalExportData): string {
  return buildPdfBlocks(data).map((b) => b.html).join("\n");
}
