import { describe, expect, it } from "vitest";

import { resolveExportBaseName } from "@/lib/export-filename";
import { buildPdfDocumentHtml } from "@/lib/export-pdf";
import type { CanonicalExportData } from "@/lib/export-types";

function makeCanonical(overrides: Partial<CanonicalExportData> = {}): CanonicalExportData {
  return {
    title: "Board Meeting Notes",
    createdAt: "Apr 11, 2026",
    duration: "2:05",
    language: "English",
    transcript: "Speaker A: Hello team",
    summary: "## Highlights\n- **Budget** approved\n- *Timeline* confirmed",
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
});

describe("pdf content rendering", () => {
  it("renders markdown-rich sections and transcript speaker labels", () => {
    const html = buildPdfDocumentHtml(makeCanonical());

    expect(html).toContain("<h1");
    expect(html).toContain("Board Meeting Notes");
    expect(html).toContain("<strong>Budget</strong>");
    expect(html).toContain("<em>Timeline</em>");
    expect(html).toContain("Questions &amp; Answers");
    expect(html).toContain("<strong>Speaker A:</strong>");
  });

  it("omits excluded qa items when they are not passed in payload", () => {
    const html = buildPdfDocumentHtml(
      makeCanonical({
        questions: [
          { prompt: "Keep this?", answer: "Included answer" },
        ],
      }),
    );

    expect(html).toContain("Included answer");
    expect(html).not.toContain("Excluded answer");
  });

  it("omits Q&A section when questions is null", () => {
    const html = buildPdfDocumentHtml(makeCanonical({ questions: null }));
    expect(html).not.toContain("Questions");
  });

  it("section order: Summary before Transcript", () => {
    const html = buildPdfDocumentHtml(makeCanonical());
    const summaryIdx = html.indexOf("Summary");
    const transcriptIdx = html.indexOf("Transcript");
    expect(summaryIdx).toBeLessThan(transcriptIdx);
  });
});
