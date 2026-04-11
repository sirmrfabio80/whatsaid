import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { resolveExportBaseName } from "./export-filename";
import type { ExportPayload } from "./export-types";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const RENDER_WIDTH_PX = 794;
const RENDER_SCALE = 2;

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

function formatMeta(payload: ExportPayload): string[] {
  const parts: string[] = [];
  if (payload.createdAt) parts.push(`Date: ${new Date(payload.createdAt).toLocaleDateString()}`);
  if (payload.language) parts.push(`Language: ${payload.language}`);
  if (payload.durationSeconds != null) {
    const minutes = Math.floor(payload.durationSeconds / 60);
    const seconds = Math.floor(payload.durationSeconds % 60);
    parts.push(`Duration: ${minutes}:${seconds.toString().padStart(2, "0")}`);
  }
  return parts;
}

export function resolvePdfBaseName(payload: ExportPayload): string {
  return resolveExportBaseName({
    jobTitle: payload.jobTitle,
    generatedTitle: payload.generatedTitle,
    originalFileName: payload.originalFileName ?? payload.fileName,
  });
}

export function buildPdfDocumentHtml(payload: ExportPayload): string {
  const title = resolvePdfBaseName(payload);
  const meta = formatMeta(payload);
  let body = `<header style="margin-bottom:24px"><h1 style="margin:0 0 6px;font-size:28px;line-height:1.2;font-weight:700;color:#111827">${escapeHtml(title)}</h1>`;

  if (meta.length > 0) {
    body += `<p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5">${escapeHtml(meta.join("  •  "))}</p>`;
  }

  body += "</header>";

  if (payload.transcript) {
    body += `<section style="margin-top:26px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Transcript</h2>${transcriptToHtml(payload.transcript)}</section>`;
  }

  if (payload.summary) {
    body += `<section style="margin-top:26px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Summary</h2>${markdownToHtml(payload.summary)}</section>`;
  }

  if (payload.customOutput) {
    body += `<section style="margin-top:26px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">AI Output</h2>`;
    if (payload.customPrompt) {
      body += `<p style="margin:0 0 10px;color:#6b7280;font-size:12px;line-height:1.5"><strong>Prompt:</strong> ${escapeHtml(payload.customPrompt)}</p>`;
    }
    body += `${markdownToHtml(payload.customOutput)}</section>`;
  }

  if (payload.questions?.length) {
    body += `<section style="margin-top:30px"><h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#111827">Questions &amp; Answers</h2>`;
    payload.questions.forEach((entry) => {
      if (entry.prompt) {
        body += `<p style="margin:16px 0 6px;font-size:14px;line-height:1.5;font-weight:700;color:#111827">Q: ${escapeHtml(entry.prompt)}</p>`;
      }
      body += `<div style="margin:0 0 14px">${markdownToHtml(entry.answer)}</div>`;
    });
    body += "</section>";
  }

  return body;
}

function createRenderRoot(markup: string): HTMLDivElement {
  const host = document.createElement("div");
  host.setAttribute("data-export-pdf-root", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    opacity: "1",
    pointerEvents: "none",
    zIndex: "-1",
  });

  host.innerHTML = `
    <div
      style="
        box-sizing:border-box;
        width:${RENDER_WIDTH_PX}px;
        background:#ffffff;
        color:#111827;
        padding:48px 56px;
        font-family:Arial,Helvetica,sans-serif;
        font-size:13px;
        line-height:1.7;
      "
    >
      ${markup}
    </div>
  `;

  document.body.appendChild(host);
  return host;
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if ("fonts" in document && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
}

export async function exportPdf(payload: ExportPayload): Promise<void> {
  const fileBaseName = resolvePdfBaseName(payload);
  const host = createRenderRoot(buildPdfDocumentHtml(payload));
  const content = host.firstElementChild as HTMLElement | null;

  if (!content) {
    host.remove();
    throw new Error("Failed to render PDF content");
  }

  try {
    await waitForLayout();

    const canvas = await html2canvas(content, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: RENDER_SCALE,
      useCORS: true,
      width: content.scrollWidth,
      height: content.scrollHeight,
      windowWidth: content.scrollWidth,
      windowHeight: content.scrollHeight,
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    pdf.setProperties({
      title: fileBaseName,
      subject: "WhatSaid export",
      creator: "WhatSaid",
      author: "WhatSaid",
    });

    const pageHeightPx = Math.floor((canvas.width * PAGE_HEIGHT_MM) / PAGE_WIDTH_MM);
    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const context = pageCanvas.getContext("2d");
      if (!context) {
        throw new Error("Failed to create PDF canvas context");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height,
      );

      const imageHeightMm = (sliceHeight * PAGE_WIDTH_MM) / canvas.width;
      if (pageIndex > 0) {
        pdf.addPage();
      }

      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, PAGE_WIDTH_MM, imageHeightMm, undefined, "FAST");

      offsetY += sliceHeight;
      pageIndex += 1;
    }

    // Use explicit blob + anchor download (same pattern as DOCX export)
    // jsPDF's built-in save() can be blocked in sandboxed iframes
    const blob = pdf.output("blob");
    downloadBlob(blob, `${fileBaseName}.pdf`);
  } finally {
    host.remove();
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