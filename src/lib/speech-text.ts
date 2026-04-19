/**
 * Pure text extractors for browser speech synthesis.
 *
 * Each function takes raw stored content and returns clean human-readable
 * text with structural pauses preserved as blank lines, so the chunker in
 * `use-speech-synthesis.ts` can split on paragraphs.
 */

import { parseSegments } from "@/lib/transcript";
import { applySpeakerNames } from "@/lib/speaker-names";

/** Strip basic markdown so it sounds natural when spoken. */
function stripMarkdown(input: string): string {
  if (!input) return "";
  let s = input;
  // Code fences
  s = s.replace(/```[\s\S]*?```/g, " ");
  // Inline code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Images ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Headings: keep the text, drop the leading hashes
  s = s.replace(/^#{1,6}\s+/gm, "");
  // Blockquotes
  s = s.replace(/^>\s?/gm, "");
  // List markers (-, *, +, 1.)
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  // Bullets sometimes used
  s = s.replace(/^\s*[•·]\s+/gm, "");
  // Bold/italic markers (**, __, *, _)
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  // Horizontal rules
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  // Collapse 3+ newlines into a single paragraph break
  s = s.replace(/\n{3,}/g, "\n\n");
  // Trim trailing spaces per line
  s = s.replace(/[ \t]+$/gm, "");
  return s.trim();
}

/**
 * Build speech text from a transcript: applies speaker names, joins as
 * "<Speaker>: <text>" per segment, with blank lines between turns for a
 * longer pause between speakers.
 */
export function transcriptToSpeech(content: string, speakerNames: Record<string, string>): string {
  if (!content?.trim()) return "";
  const named = applySpeakerNames(content, speakerNames);
  const segments = parseSegments(named);
  const lines: string[] = [];
  for (const seg of segments) {
    const text = seg.text?.trim();
    if (!text) continue;
    if (seg.speaker) {
      lines.push(`${seg.speaker}: ${text}`);
    } else {
      lines.push(text);
    }
    // Blank line between turns → paragraph break → longer pause.
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Build speech text from a markdown summary, preserving paragraph breaks. */
export function summaryToSpeech(content: string): string {
  if (!content?.trim()) return "";
  return stripMarkdown(content);
}

/** Build speech text from the latest visible answer (markdown stripped). */
export function latestAnswerToSpeech(answer: string): string {
  if (!answer?.trim()) return "";
  return stripMarkdown(answer);
}
