import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import logoUrl from "@/assets/logo.png";

import type { CanonicalExportData } from "./export-types";

/** Cache the logo as a base64 data URL so we decode it only once per session. */
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
/*  PDF Layout Tokens                                                  */
/* ------------------------------------------------------------------ */

/** Page geometry */
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

/** Page margins — reduced for more content width on mobile screens */
const MARGIN_LEFT_MM = 10;
const MARGIN_RIGHT_MM = 10;
const MARGIN_TOP_MM = 12;

/** Footer reservation — fixed area at page bottom that content must never enter */
const FOOTER_RESERVE_MM = 14;

/** Derived layout values */
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM;
const MAX_CONTENT_Y_MM = PAGE_HEIGHT_MM - FOOTER_RESERVE_MM;

/** Render pipeline */
const RENDER_WIDTH_PX = 794;
const RENDER_SCALE = 3;

/** Spacing between blocks (mm) */
const SECTION_GAP_MM = 3.5;
const PARAGRAPH_GAP_MM = 1;

/** Typography (px) — optimised for handheld PDF reading */
const BODY_FONT_PX = 15;
const TRANSCRIPT_FONT_PX = 15;
const TIMESTAMP_FONT_PX = 12;
const META_FONT_PX = 13;
const H1_FONT_PX = 30;
const H2_FONT_PX = 20;
const H3_FONT_PX = 18;
const H4_FONT_PX = 17;
const QA_PROMPT_FONT_PX = 15;
const BULLET_FONT_PX = BODY_FONT_PX;

/** Colours */
const COLOR_HEADING = "#111827";
const COLOR_BODY = "#1f2937";
const COLOR_TIMESTAMP = "#9ca3af";
const COLOR_SPEAKER = "#111827";
const COLOR_META = "#6b7280";
const COLOR_DIVIDER = "#e5e7eb";
const COLOR_ACCENT = "#6366f1";

/** Inner wrapper horizontal padding (px) — tighter to maximise reading width */
const WRAPPER_PAD_X_PX = 28;

/** Approximate usable content height in px (at scale 1) used as batch threshold */
const BATCH_HEIGHT_THRESHOLD_PX = 800;

/* ------------------------------------------------------------------ */
/*  HTML helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(escaped: string): string {
  let result = escaped.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return result;
}

/**
 * Split markdown text into sections where each section starts with a heading.
 * Each returned chunk contains the heading AND the content that follows it,
 * so they are always rendered together (preventing orphaned headings).
 */
function splitMarkdownBySections(text: string): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{2,4}\s/.test(line) && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

function markdownToHtml(text: string): string {
  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);

    if (!bulletMatch && inList) {
      htmlParts.push("</ul>");
      inList = false;
    }

    if (line.startsWith("### ")) {
      htmlParts.push(`<h4 style="font-size:${H4_FONT_PX}px;line-height:1.35;margin:14px 0 6px;font-weight:700;color:${COLOR_HEADING}">${inlineMarkdownToHtml(escapeHtml(line.slice(4)))}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      htmlParts.push(`<h3 style="font-size:${H3_FONT_PX}px;line-height:1.35;margin:18px 0 8px;font-weight:700;color:${COLOR_HEADING}">${inlineMarkdownToHtml(escapeHtml(line.slice(3)))}</h3>`);
      continue;
    }

    if (bulletMatch) {
      if (!inList) {
        htmlParts.push('<ul style="margin:8px 0 8px 22px;padding:0">');
        inList = true;
      }
      htmlParts.push(`<li style="margin:3px 0;line-height:1.6;font-size:${BULLET_FONT_PX}px">${inlineMarkdownToHtml(escapeHtml(bulletMatch[1]))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      htmlParts.push('<div style="height:8px"></div>');
      continue;
    }

    htmlParts.push(`<p style="margin:5px 0;line-height:1.65;font-size:${BODY_FONT_PX}px;color:${COLOR_BODY}">${inlineMarkdownToHtml(escapeHtml(line))}</p>`);
  }

  if (inList) htmlParts.push("</ul>");
  return htmlParts.join("");
}

function speakerParagraphToHtml(line: string): string {
  // Match timestamp + speaker: "[00:12:34] Speaker Name: text..."
  const tsMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.+?):\s(.*)/);
  if (tsMatch) {
    const timestamp = tsMatch[1];
    const speaker = escapeHtml(tsMatch[2]);
    const text = escapeHtml(tsMatch[3]);
    return `<p style="margin:6px 0 2px;line-height:1.6;font-size:${TRANSCRIPT_FONT_PX}px;color:${COLOR_BODY}"><span style="font-size:${TIMESTAMP_FONT_PX}px;color:${COLOR_TIMESTAMP};font-family:monospace;letter-spacing:-0.3px">${timestamp}</span>&ensp;<strong style="color:${COLOR_SPEAKER};font-weight:700">${speaker}:</strong> ${text}</p>`;
  }
  // Fallback: speaker without timestamp
  const speakerMatch = line.match(/^(.+?):\s/);
  if (speakerMatch) {
    const label = escapeHtml(`${speakerMatch[1]}:`);
    const rest = escapeHtml(line.slice(speakerMatch[0].length));
    return `<p style="margin:6px 0 2px;line-height:1.6;font-size:${TRANSCRIPT_FONT_PX}px;color:${COLOR_BODY}"><strong style="color:${COLOR_SPEAKER};font-weight:700">${label}</strong> ${rest}</p>`;
  }
  if (!line.trim()) {
    return '<div style="height:6px"></div>';
  }
  return `<p style="margin:5px 0;line-height:1.65;font-size:${TRANSCRIPT_FONT_PX}px;color:${COLOR_BODY}">${escapeHtml(line)}</p>`;
}

/** A thin accent divider + heading combo used before major sections */
function sectionHeadingHtml(title: string): string {
  return `<div style="border-top:2px solid ${COLOR_ACCENT};padding-top:10px;margin-top:4px"><h2 style="margin:0 0 8px;font-size:${H2_FONT_PX}px;line-height:1.3;font-weight:700;color:${COLOR_HEADING}">${escapeHtml(title)}</h2></div>`;
}

/* ------------------------------------------------------------------
  html: string;
  /** Force a new page before this block */
  forceNewPage: boolean;
  /** Gap after this block (mm) — use smaller gap for paragraphs within a section */
  gapAfterMm: number;
}

/**
 * Build an ordered list of atomic blocks for PDF rendering.
 * Each block is the smallest unit that must NOT be split across pages.
 * Long sections (transcript, Q&A) are split into per-paragraph blocks.
 */
export function buildPdfBlocks(data: CanonicalExportData): PdfBlock[] {
  const blocks: PdfBlock[] = [];

  // --- Header + Summary (combined so they always appear together on page 1) ---
  const meta: string[] = [];
  meta.push(`Date: ${data.createdAt}`);
  if (data.duration) meta.push(`Duration: ${data.duration}`);
  if (data.language) meta.push(`Language: ${data.language}`);

  let headerHtml = `<header><h1 style="margin:0 0 5px;font-size:${H1_FONT_PX}px;line-height:1.2;font-weight:700;color:#111827">${escapeHtml(data.title)}</h1>`;
  headerHtml += `<p style="margin:0;color:#6b7280;font-size:${META_FONT_PX}px;line-height:1.5">${escapeHtml(meta.join("  •  "))}</p>`;
  headerHtml += "</header>";

  if (data.summary) {
    // Split summary into sections so headings always stay with their content
    const sections = splitMarkdownBySections(data.summary);
    // First section merges with the header + "Summary" heading
    const firstSection = sections[0] || "";
    headerHtml += `<section style="margin-top:20px"><h2 style="margin:0 0 8px;font-size:${H2_FONT_PX}px;line-height:1.3;font-weight:700;color:#111827">Summary</h2>${markdownToHtml(firstSection)}</section>`;
    blocks.push({ html: headerHtml, forceNewPage: false, gapAfterMm: PARAGRAPH_GAP_MM });

    // Remaining summary sections as separate blocks (heading + content kept together)
    for (let s = 1; s < sections.length; s++) {
      blocks.push({
        html: `<section>${markdownToHtml(sections[s])}</section>`,
        forceNewPage: false,
        gapAfterMm: s < sections.length - 1 ? PARAGRAPH_GAP_MM : SECTION_GAP_MM,
      });
    }
  } else {
    blocks.push({ html: headerHtml, forceNewPage: false, gapAfterMm: SECTION_GAP_MM });
  }

  // --- Questions & Answers (heading + each Q/A as its own block) ---
  if (data.questions && data.questions.length > 0) {
    blocks.push({
      html: `<h2 style="margin:0 0 8px;font-size:${H2_FONT_PX}px;line-height:1.3;font-weight:700;color:#111827">Questions &amp; Answers</h2>`,
      forceNewPage: true,
      gapAfterMm: PARAGRAPH_GAP_MM,
    });

    data.questions.forEach((entry, i) => {
      let qaBlockHtml = "";
      if (entry.prompt) {
        qaBlockHtml += `<p style="margin:12px 0 5px;font-size:${QA_PROMPT_FONT_PX}px;line-height:1.5;font-weight:700;color:#111827">Q: ${escapeHtml(entry.prompt)}</p>`;
      }
      qaBlockHtml += `<div style="margin:0 0 4px">${markdownToHtml(entry.answer)}</div>`;
      blocks.push({
        html: qaBlockHtml,
        forceNewPage: false,
        gapAfterMm: i < data.questions!.length - 1 ? PARAGRAPH_GAP_MM : SECTION_GAP_MM,
      });
    });
  }

  // --- Transcript (heading + each speaker paragraph as its own block) ---
  if (data.transcript) {
    blocks.push({
      html: `<h2 style="margin:0 0 8px;font-size:${H2_FONT_PX}px;line-height:1.3;font-weight:700;color:#111827">Transcript</h2>`,
      forceNewPage: true,
      gapAfterMm: PARAGRAPH_GAP_MM,
    });

    const lines = data.transcript.split("\n");
    lines.forEach((line, i) => {
      blocks.push({
        html: speakerParagraphToHtml(line),
        forceNewPage: false,
        gapAfterMm: i < lines.length - 1 ? PARAGRAPH_GAP_MM : 0,
      });
    });
  }

  return blocks;
}

// Keep for backward compat / testing
export function buildPdfSections(data: CanonicalExportData): { html: string; forceNewPage: boolean }[] {
  const blocks = buildPdfBlocks(data);
  const sections: { html: string; forceNewPage: boolean }[] = [];
  let currentHtml = "";
  let currentForce = false;

  for (const block of blocks) {
    if (block.forceNewPage && currentHtml) {
      sections.push({ html: currentHtml, forceNewPage: currentForce });
      currentHtml = "";
    }
    if (block.forceNewPage) currentForce = true;
    else if (!currentHtml) currentForce = false;
    currentHtml += block.html;
  }
  if (currentHtml) {
    sections.push({ html: currentHtml, forceNewPage: currentForce });
  }
  return sections;
}

export function buildPdfDocumentHtml(data: CanonicalExportData): string {
  return buildPdfBlocks(data).map((b) => b.html).join("");
}

/* ------------------------------------------------------------------ */
/*  Performance instrumentation                                        */
/* ------------------------------------------------------------------ */

interface PdfPerfLog {
  originalBlockCount: number;
  batchedBlockCount: number;
  totalTimeMs: number;
  layoutMeasureTimeMs: number;
  html2canvasTimeMs: number;
  pngEncodeTimeMs: number;
}

/* ------------------------------------------------------------------ */
/*  Layout-aware batching                                              */
/* ------------------------------------------------------------------ */

const WRAPPER_STYLE = `box-sizing:border-box;width:${RENDER_WIDTH_PX}px;background:#ffffff;color:#111827;padding:10px ${WRAPPER_PAD_X_PX}px;font-family:Arial,Helvetica,sans-serif;font-size:${BODY_FONT_PX}px;line-height:1.65;`;

/**
 * Measure each block's rendered height using a single reusable container,
 * then merge consecutive non-forceNewPage blocks until combined height
 * approaches the page height threshold.
 */
function measureAndBatchBlocks(
  blocks: PdfBlock[],
): { batched: PdfBlock[]; layoutMeasureTimeMs: number } {
  const measureStart = performance.now();

  // Create a single measurement container
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    opacity: "1",
    pointerEvents: "none",
    zIndex: "-1",
  });
  const inner = document.createElement("div");
  inner.setAttribute("style", WRAPPER_STYLE);
  container.appendChild(inner);
  document.body.appendChild(container);

  // Measure each block's height
  const heights: number[] = [];
  for (const block of blocks) {
    inner.innerHTML = block.html;
    heights.push(inner.scrollHeight);
  }

  // Remove measurement container
  container.remove();

  // Batch blocks by accumulated height
  const batched: PdfBlock[] = [];
  let batchHtml = "";
  let batchHeight = 0;
  let batchGap = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // If this block forces a new page, flush the current batch first
    if (block.forceNewPage) {
      if (batchHtml) {
        batched.push({ html: batchHtml, forceNewPage: false, gapAfterMm: batchGap });
      }
      // Start a new batch with this block
      batchHtml = block.html;
      batchHeight = heights[i];
      batchGap = block.gapAfterMm;
      // Mark the batch as forceNewPage
      // We'll flush it either when the next forceNewPage comes or when height exceeds threshold
      batched.push({ html: batchHtml, forceNewPage: true, gapAfterMm: batchGap });
      batchHtml = "";
      batchHeight = 0;
      batchGap = 0;
      continue;
    }

    // Would adding this block exceed the threshold?
    if (batchHtml && batchHeight + heights[i] > BATCH_HEIGHT_THRESHOLD_PX) {
      // Flush current batch
      batched.push({ html: batchHtml, forceNewPage: false, gapAfterMm: batchGap });
      batchHtml = "";
      batchHeight = 0;
    }

    batchHtml += block.html;
    batchHeight += heights[i];
    batchGap = block.gapAfterMm;
  }

  // Flush remaining
  if (batchHtml) {
    batched.push({ html: batchHtml, forceNewPage: false, gapAfterMm: batchGap });
  }

  const layoutMeasureTimeMs = performance.now() - measureStart;
  return { batched, layoutMeasureTimeMs };
}

/* ------------------------------------------------------------------ */
/*  DOM + Canvas helpers                                               */
/* ------------------------------------------------------------------ */

function createBlockElement(html: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-export-pdf-block", "true");
  Object.assign(el.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    opacity: "1",
    pointerEvents: "none",
    zIndex: "-1",
  });
  el.innerHTML = `<div style="${WRAPPER_STYLE}">${html}</div>`;
  document.body.appendChild(el);
  return el;
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if ("fonts" in document && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
}

async function renderCanvas(el: HTMLDivElement): Promise<HTMLCanvasElement> {
  const content = el.firstElementChild as HTMLElement;
  return html2canvas(content, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: RENDER_SCALE,
    useCORS: true,
    width: content.scrollWidth,
    height: content.scrollHeight,
    windowWidth: content.scrollWidth,
    windowHeight: content.scrollHeight,
  });
}

function canvasHeightMm(canvas: HTMLCanvasElement): number {
  return (canvas.height * CONTENT_WIDTH_MM) / canvas.width;
}

/* ------------------------------------------------------------------ */
/*  PDF export                                                         */
/* ------------------------------------------------------------------ */

export async function generatePdfBlob(data: CanonicalExportData): Promise<Blob> {
  const totalStart = performance.now();
  const originalBlocks = buildPdfBlocks(data);

  // Measure and batch
  const { batched: blocks, layoutMeasureTimeMs } = measureAndBatchBlocks(originalBlocks);

  // Create render elements only for batched blocks
  const elements = blocks.map((b) => createBlockElement(b.html));

  let html2canvasTimeMs = 0;
  let pngEncodeTimeMs = 0;

  try {
    await waitForLayout();

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

    let currentY = MARGIN_TOP_MM;
    const usableHeight = MAX_CONTENT_Y_MM - MARGIN_TOP_MM;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      const h2cStart = performance.now();
      const canvas = await renderCanvas(elements[i]);
      html2canvasTimeMs += performance.now() - h2cStart;

      const heightMm = canvasHeightMm(canvas);

      if (block.forceNewPage && currentY > MARGIN_TOP_MM) {
        pdf.addPage();
        currentY = MARGIN_TOP_MM;
      }

      const remainingMm = MAX_CONTENT_Y_MM - currentY;

      // Block fits on current page
      if (heightMm <= remainingMm) {
        const encStart = performance.now();
        const imgData = canvas.toDataURL("image/png");
        pngEncodeTimeMs += performance.now() - encStart;

        pdf.addImage(
          imgData,
          "PNG",
          MARGIN_LEFT_MM,
          currentY,
          CONTENT_WIDTH_MM,
          heightMm,
          undefined,
          "FAST",
        );
        currentY += heightMm + block.gapAfterMm;
        continue;
      }

      // Block doesn't fit — need to slice across pages
      if (currentY > MARGIN_TOP_MM) {
        pdf.addPage();
        currentY = MARGIN_TOP_MM;
      }

      // Slice the canvas image across as many pages as needed
      const pxPerMm = canvas.width / CONTENT_WIDTH_MM;
      let renderedMm = 0;

      while (renderedMm < heightMm) {
        const sliceHeightMm = Math.min(usableHeight, heightMm - renderedMm);
        const srcY = Math.round(renderedMm * pxPerMm);
        const srcH = Math.round(sliceHeightMm * pxPerMm);

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = srcH;
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0, srcY, canvas.width, srcH,
            0, 0, canvas.width, srcH,
          );
        }

        if (renderedMm > 0) {
          pdf.addPage();
          currentY = MARGIN_TOP_MM;
        }

        const encStart = performance.now();
        const imgData = sliceCanvas.toDataURL("image/png");
        pngEncodeTimeMs += performance.now() - encStart;

        pdf.addImage(
          imgData,
          "PNG",
           MARGIN_LEFT_MM,
          currentY,
          CONTENT_WIDTH_MM,
          sliceHeightMm,
          undefined,
          "FAST",
        );

        renderedMm += sliceHeightMm;
        currentY = MARGIN_TOP_MM + sliceHeightMm;
      }

      currentY += block.gapAfterMm;
    }

    // Load logo for footer
    const logoData = await getLogoDataUrl();

    // Draw branded footer on every page
    const pageCount = pdf.getNumberOfPages();
    const WHATSAID_URL = "https://whatsaid.lovable.app";
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      const footerY = PAGE_HEIGHT_MM - FOOTER_RESERVE_MM + 6;
      // Subtle divider line
      pdf.setDrawColor(209, 213, 219); // gray-300
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN_LEFT_MM, footerY - 2, PAGE_WIDTH_MM - MARGIN_RIGHT_MM, footerY - 2);

      // Logo (square, 4mm)
      const logoSize = 4;
      const logoY = footerY - 1;
      let textStartX = MARGIN_LEFT_MM;
      if (logoData) {
        pdf.addImage(logoData, "PNG", MARGIN_LEFT_MM, logoY, logoSize, logoSize, undefined, "FAST");
        textStartX = MARGIN_LEFT_MM + logoSize + 1.5;
      }

      // Brand text — vertically centered with logo
      // Logo center = logoY + logoSize/2. For 8pt text, baseline ≈ center + 1mm
      const textY = logoY + logoSize / 2 + 1;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(156, 163, 175); // gray-400
      const footerText = "Generated by WhatSaid  ·  whatsaid.app";
      pdf.text(footerText, textStartX, textY);

      // Clickable link over the footer text area
      const textWidth = pdf.getTextWidth(footerText);
      pdf.link(textStartX, logoY, textWidth, logoSize, { url: WHATSAID_URL });

      // Page number
      pdf.text(`${p} / ${pageCount}`, PAGE_WIDTH_MM - MARGIN_RIGHT_MM, textY, { align: "right" });
    }

    const totalTimeMs = performance.now() - totalStart;
    const perfLog: PdfPerfLog = {
      originalBlockCount: originalBlocks.length,
      batchedBlockCount: blocks.length,
      totalTimeMs: Math.round(totalTimeMs),
      layoutMeasureTimeMs: Math.round(layoutMeasureTimeMs),
      html2canvasTimeMs: Math.round(html2canvasTimeMs),
      pngEncodeTimeMs: Math.round(pngEncodeTimeMs),
    };
    console.info("[PDF perf]", perfLog);

    return pdf.output("blob");
  } finally {
    elements.forEach((el) => el.remove());
  }
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
