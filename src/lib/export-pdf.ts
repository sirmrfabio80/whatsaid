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

  if (inList) {
    htmlParts.push("</ul>");
  }

  return htmlParts.join("");
}

function transcriptToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
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
    })
    .join("");
}

interface PdfSection {
  html: string;
  forceNewPage: boolean;
}

export function buildPdfSections(data: CanonicalExportData): PdfSection[] {
  const sections: PdfSection[] = [];
  const meta: string[] = [];

  meta.push(`Date: ${data.createdAt}`);
  if (data.duration) meta.push(`Duration: ${data.duration}`);
  if (data.language) meta.push(`Language: ${data.language}`);

  let header = `<header><h1 style="margin:0 0 6px;font-size:28px;line-height:1.2;font-weight:700;color:#111827">${escapeHtml(data.title)}</h1>`;
  header += `<p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">${escapeHtml(meta.join("  •  "))}</p>`;
  header += "</header>";
  sections.push({ html: header, forceNewPage: false });

  if (data.summary) {
    const summaryHtml = `<section style="margin-top:26px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Summary</h2>${markdownToHtml(data.summary)}</section>`;
    sections.push({ html: summaryHtml, forceNewPage: false });
  }

  if (data.questions && data.questions.length > 0) {
    let qaHtml = `<section><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Questions &amp; Answers</h2>`;
    data.questions.forEach((entry) => {
      if (entry.prompt) {
        qaHtml += `<p style="margin:16px 0 6px;font-size:14px;line-height:1.5;font-weight:700;color:#111827">Q: ${escapeHtml(entry.prompt)}</p>`;
      }
      qaHtml += `<div style="margin:0 0 14px">${markdownToHtml(entry.answer)}</div>`;
    });
    qaHtml += "</section>";
    sections.push({ html: qaHtml, forceNewPage: true });
  }

  if (data.transcript) {
    const transcriptHtml = `<section><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Transcript</h2>${transcriptToHtml(data.transcript)}</section>`;
    sections.push({ html: transcriptHtml, forceNewPage: true });
  }

  return sections;
}

export function buildPdfDocumentHtml(data: CanonicalExportData): string {
  return buildPdfSections(data).map((section) => section.html).join("");
}

function createSectionElement(html: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-export-pdf-section", "true");
  Object.assign(el.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    opacity: "1",
    pointerEvents: "none",
    zIndex: "-1",
  });

  el.innerHTML = `
    <div
      style="
        box-sizing:border-box;
        width:${RENDER_WIDTH_PX}px;
        background:#ffffff;
        color:#111827;
        padding:24px 56px;
        font-family:Arial,Helvetica,sans-serif;
        font-size:13px;
        line-height:1.7;
      "
    >
      ${html}
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if ("fonts" in document && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
}

async function renderSectionCanvas(el: HTMLDivElement): Promise<HTMLCanvasElement> {
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

function getRenderedHeightMm(imageWidthPx: number, imageHeightPx: number): number {
  return (imageHeightPx * CONTENT_WIDTH_MM) / imageWidthPx;
}

function createSliceCanvas(sourceCanvas: HTMLCanvasElement, offsetY: number, sliceHeight: number): HTMLCanvasElement {
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = sourceCanvas.width;
  pageCanvas.height = sliceHeight;

  const context = pageCanvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create PDF canvas context");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  context.drawImage(sourceCanvas, 0, offsetY, sourceCanvas.width, sliceHeight, 0, 0, pageCanvas.width, sliceHeight);

  return pageCanvas;
}

export async function exportPdf(data: CanonicalExportData): Promise<void> {
  const sections = buildPdfSections(data);
  const elements = sections.map((section) => createSectionElement(section.html));

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

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      const canvas = await renderSectionCanvas(elements[index]);
      const sectionHeightMm = getRenderedHeightMm(canvas.width, canvas.height);

      if (section.forceNewPage && currentY > MARGIN_MM) {
        pdf.addPage();
        currentY = MARGIN_MM;
      }

      if (currentY >= MAX_CONTENT_Y_MM) {
        pdf.addPage();
        currentY = MARGIN_MM;
      }

      const remainingPageMm = MAX_CONTENT_Y_MM - currentY;

      if (sectionHeightMm <= remainingPageMm) {
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          MARGIN_MM,
          currentY,
          CONTENT_WIDTH_MM,
          sectionHeightMm,
          undefined,
          "FAST",
        );

        currentY += sectionHeightMm;
        if (index < sections.length - 1) {
          currentY += SECTION_GAP_MM;
        }
        continue;
      }

      let offsetY = 0;

      while (offsetY < canvas.height) {
        let remainingSliceMm = MAX_CONTENT_Y_MM - currentY;
        if (remainingSliceMm <= 0) {
          pdf.addPage();
          currentY = MARGIN_MM;
          remainingSliceMm = MAX_CONTENT_Y_MM - currentY;
        }

        const remainingSlicePx = Math.max(
          1,
          Math.floor((remainingSliceMm * canvas.width) / CONTENT_WIDTH_MM),
        );
        const sliceHeight = Math.min(remainingSlicePx, canvas.height - offsetY);
        const sliceCanvas = createSliceCanvas(canvas, offsetY, sliceHeight);
        const sliceHeightMm = getRenderedHeightMm(sliceCanvas.width, sliceCanvas.height);

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

        currentY += sliceHeightMm;
        offsetY += sliceHeight;

        if (offsetY < canvas.height) {
          pdf.addPage();
          currentY = MARGIN_MM;
        } else if (index < sections.length - 1) {
          currentY += SECTION_GAP_MM;
        }
      }
    }

    const blob = pdf.output("blob");
    downloadBlob(blob, `${data.title}.pdf`);
  } finally {
    elements.forEach((el) => el.remove());
  }
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
