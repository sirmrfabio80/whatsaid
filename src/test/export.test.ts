import { describe, expect, it } from "vitest";

import { resolveExportBaseName } from "@/lib/export-filename";
import { buildPdfDocumentHtml, resolvePdfBaseName } from "@/lib/export-pdf";
import type { ExportPayload } from "@/lib/export-types";

function makePayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    fileName: "Fallback Name",
    jobTitle: "Board Meeting Notes",
    generatedTitle: null,
    originalFileName: "meeting-audio.m4a",
    language: "English",
    durationSeconds: 125,
    createdAt: "2026-04-11T10:00:00.000Z",
    transcript: "Speaker A: Hello team",
    summary: "## Highlights\n- **Budget** approved\n- *Timeline* confirmed",
    customPrompt: null,
    customOutput: null,
    questions: [
      {
        prompt: "What was decided?",
        answer: "- **Budget** approved",
      },
    ],
    ...overrides,
  };
}

describe("export naming", () => {
  it("prefers job title over other values", () => {
    expect(
      resolveExportBaseName({
        jobTitle: "Client Sync",
        generatedTitle: "Generated Title",
        originalFileName: "audio-file.wav",
      }),
    ).toBe("Client Sync");
  });

  it("falls back to generated title then original filename then default", () => {
    expect(
      resolveExportBaseName({
        jobTitle: null,
        generatedTitle: "Auto Title",
        originalFileName: "audio-file.wav",
      }),
    ).toBe("Auto Title");

    expect(
      resolveExportBaseName({
        jobTitle: null,
        generatedTitle: null,
        originalFileName: "audio-file.wav",
      }),
    ).toBe("audio-file");

    expect(
      resolveExportBaseName({
        jobTitle: null,
        generatedTitle: null,
        originalFileName: null,
      }),
    ).toBe("WhatSaid-export");
  });

  it("uses job title for pdf filename resolution", () => {
    expect(resolvePdfBaseName(makePayload())).toBe("Board Meeting Notes");
  });
});

describe("pdf content rendering", () => {
  it("renders markdown-rich sections and transcript speaker labels", () => {
    const html = buildPdfDocumentHtml(makePayload());

    expect(html).toContain("<h1");
    expect(html).toContain("Board Meeting Notes");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>Budget</strong>");
    expect(html).toContain("<em>Timeline</em>");
    expect(html).toContain("Questions &amp; Answers");
    expect(html).toContain("<strong>Speaker A:</strong>");
  });

  it("omits excluded qa items when they are not passed in payload", () => {
    const html = buildPdfDocumentHtml(
      makePayload({
        questions: [
          { prompt: "Keep this?", answer: "Included answer" },
        ],
      }),
    );

    expect(html).toContain("Included answer");
    expect(html).not.toContain("Excluded answer");
  });
});