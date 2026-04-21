import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { applySpeakerNames } from "@/lib/speaker-names";
import { resolveExportBaseName } from "@/lib/export-filename";
import { formatRecordedDate } from "@/lib/recorded-date";
import { getUniqueSpeakersFromContent } from "@/lib/transcript";
import type { CanonicalExportData, QAEntry } from "@/lib/export-types";

export interface CanonicalPayloadInput {
  jobTitle: string | null;
  generatedTitle: string | null;
  originalFileName: string | null;
  /** ISO timestamp: recorded_at ?? created_at */
  createdAt: string | null;
  durationSeconds: number | null;
  languageCode: string | null;
  speakerNames: Record<string, string>;
  transcript: string | null;
  summary: string | null;
  questionEntries: { id: string; prompt: string | null; content: string }[];
  excludedQAIds: Set<string>;
}

export function buildCanonicalPayload(input: CanonicalPayloadInput): CanonicalExportData {
  const title = resolveExportBaseName({
    jobTitle: input.jobTitle,
    generatedTitle: input.generatedTitle,
    originalFileName: input.originalFileName,
  });

  // Use deterministic formatting from the raw ISO string
  const createdAt = input.createdAt
    ? formatRecordedDate(input.createdAt)
    : formatRecordedDate(new Date().toISOString());

  const duration =
    input.durationSeconds != null ? formatDuration(input.durationSeconds) : null;

  const language = input.languageCode
    ? getLanguageLabel(input.languageCode)
    : null;

  const summary = input.summary
    ? applySpeakerNames(input.summary, input.speakerNames)
    : null;

  const transcript = input.transcript
    ? applySpeakerNames(input.transcript, input.speakerNames)
    : null;

  // Derive the list of speakers AFTER renames, in first-appearance order, so
  // the PDF/header reflects what the user actually sees on the record page.
  const speakers = transcript ? getUniqueSpeakersFromContent(transcript) : [];

  const included = input.questionEntries.filter(
    (q) => !input.excludedQAIds.has(q.id),
  );
  const questions: QAEntry[] | null =
    included.length > 0
      ? included.map((q) => ({
          prompt: q.prompt,
          answer: applySpeakerNames(q.content, input.speakerNames),
        }))
      : null;

  return {
    title,
    createdAt,
    duration,
    language,
    speakers: speakers.length > 0 ? speakers : undefined,
    summary,
    questions,
    transcript,
  };
}
