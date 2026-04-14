import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import type { CanonicalExportData } from "./export-types";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const BOTTOM_PADDING_MM = 10;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const MAX_CONTENT_Y_MM = PAGE_HEIGHT_MM - MARGIN_MM - BOTTOM_PADDING_MM;
const RENDER_WIDTH_PX = 794;
const RENDER_SCALE = 2;
const SECTION_GAP_MM = 4;
const PARAGRAPH_GAP_MM = 1.5;

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
      htmlParts.push(`<h4 style="font-size:16px;line-height:1.35;margin:18px 0 8px;font-weight:700">${inlineMarkdownToHtml(escapeHtml(line.slice(4)))}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      htmlParts.push(`<h3 style="font-size:18px;line-height:1.35;margin:22px 0 10px;font-weight:700">${inlineMarkdownToHtml(escapeHtml(line.slice(3)))}</h3>`);
      continue;
    }

    if (bulletMatch) {
      if (!inList) {
        htmlParts.push('<ul style="margin:8px 0 8px 22px;padding:0">');
        inList = true;
      }
      htmlParts.push(`<li style="margin:4px 0;line-height:1.65">${inlineMarkdownToHtml(escapeHtml(bulletMatch[1]))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      htmlParts.push('<div style="height:8px"></div>');
      continue;
    }

    htmlParts.push(`<p style="margin:6px 0;line-height:1.7">${inlineMarkdownToHtml(escapeHtml(line))}</p>`);
  }

  if (inList) htmlParts.push("</ul>");
  return htmlParts.join("");
}

function speakerParagraphToHtml(line: string): string {
  const speakerMatch = line.match(/^(.+?):\s/);
  if (speakerMatch) {
    const label = escapeHtml(`${speakerMatch[1]}:`);
    const rest = escapeHtml(line.slice(speakerMatch[0].length));
    return `<p style="margin:6px 0;line-height:1.7"><strong>${label}</strong> ${rest}</p>`;
  }
  if (!line.trim()) {
    return '<div style="height:8px"></div>';
  }
  return `<p style="margin:6px 0;line-height:1.7">${escapeHtml(line)}</p>`;
}

/* ------------------------------------------------------------------ */
/*  Section model                                                      */
/* ------------------------------------------------------------------ */

interface PdfBlock {
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

  let headerAndSummary = `<header><h1 style="margin:0 0 6px;font-size:28px;line-height:1.2;font-weight:700;color:#111827">${escapeHtml(data.title)}</h1>`;
  headerAndSummary += `<p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">${escapeHtml(meta.join("  •  "))}</p>`;
  headerAndSummary += "</header>";

  if (data.summary) {
    headerAndSummary += `<section style="margin-top:26px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Summary</h2>${markdownToHtml(data.summary)}</section>`;
  }

  blocks.push({ html: headerAndSummary, forceNewPage: false, gapAfterMm: SECTION_GAP_MM });

  // --- Questions & Answers (heading + each Q/A as its own block) ---
  if (data.questions && data.questions.length > 0) {
    // Section heading block
    blocks.push({
      html: `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Questions &amp; Answers</h2>`,
      forceNewPage: true,
      gapAfterMm: PARAGRAPH_GAP_MM,
    });

    data.questions.forEach((entry, i) => {
      let qaBlockHtml = "";
      if (entry.prompt) {
        qaBlockHtml += `<p style="margin:16px 0 6px;font-size:14px;line-height:1.5;font-weight:700;color:#111827">Q: ${escapeHtml(entry.prompt)}</p>`;
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
    // Section heading block
    blocks.push({
      html: `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Transcript</h2>`,
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
  // Group blocks back into legacy sections for tests
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
/*  DOM + Canvas helpers                                               */
/* ------------------------------------------------------------------ */

const WRAPPER_STYLE = `box-sizing:border-box;width:${RENDER_WIDTH_PX}px;background:#ffffff;color:#111827;padding:12px 56px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;`;

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
  const blocks = buildPdfBlocks(data);
  const elements = blocks.map((b) => createBlockElement(b.html));

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

    let currentY = MARGIN_MM;
    const usableHeight = MAX_CONTENT_Y_MM - MARGIN_MM;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const canvas = await renderCanvas(elements[i]);
      const heightMm = canvasHeightMm(canvas);

      if (block.forceNewPage && currentY > MARGIN_MM) {
        pdf.addPage();
        currentY = MARGIN_MM;
      }

      const remainingMm = MAX_CONTENT_Y_MM - currentY;

      // Block fits on current page
      if (heightMm <= remainingMm) {
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          MARGIN_MM,
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
      // First, move to a new page if we're not at the top
      if (currentY > MARGIN_MM) {
        pdf.addPage();
        currentY = MARGIN_MM;
      }

      // Slice the canvas image across as many pages as needed
      const pxPerMm = canvas.width / CONTENT_WIDTH_MM;
      let renderedMm = 0;

      while (renderedMm < heightMm) {
        const sliceHeightMm = Math.min(usableHeight, heightMm - renderedMm);
        const srcY = Math.round(renderedMm * pxPerMm);
        const srcH = Math.round(sliceHeightMm * pxPerMm);

        // Create a sub-canvas for this page slice
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
          currentY = MARGIN_MM;
        }

        pdf.addImage(
          sliceCanvas.toDataURL("image/png"),
          "PNG",
          MARGIN_MM,
          currentY,
          CONTENT_WIDTH_MM,
          sliceHeightMm,
          undefined,
          "FAST",
        );

        renderedMm += sliceHeightMm;
        currentY = MARGIN_MM + sliceHeightMm;
      }

      currentY += block.gapAfterMm;
    }

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
