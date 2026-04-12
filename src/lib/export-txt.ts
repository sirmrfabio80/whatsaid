import type { CanonicalExportData } from "@/lib/export-types";

const SEP = "═".repeat(60);
const THIN = "─".repeat(60);

export function buildTxt(data: CanonicalExportData): string {
  const lines: string[] = [];

  // Title
  lines.push(SEP);
  lines.push(data.title);
  lines.push(SEP);
  lines.push("");

  // Meta
  lines.push(`Date: ${data.createdAt}`);
  if (data.duration) lines.push(`Duration: ${data.duration}`);
  if (data.language) lines.push(`Language: ${data.language}`);
  lines.push("");

  // Summary
  if (data.summary) {
    lines.push(THIN);
    lines.push("SUMMARY");
    lines.push(THIN);
    lines.push("");
    lines.push(data.summary);
    lines.push("");
  }

  // Questions & Answers
  if (data.questions && data.questions.length > 0) {
    lines.push(THIN);
    lines.push("QUESTIONS & ANSWERS");
    lines.push(THIN);
    lines.push("");
    data.questions.forEach((qa, i) => {
      if (i > 0) lines.push("");
      if (qa.prompt) lines.push(`Q: ${qa.prompt}`);
      lines.push(qa.answer);
    });
    lines.push("");
  }

  // Transcript
  if (data.transcript) {
    lines.push(THIN);
    lines.push("TRANSCRIPT");
    lines.push(THIN);
    lines.push("");
    lines.push(data.transcript);
  }

  return lines.join("\n");
}
