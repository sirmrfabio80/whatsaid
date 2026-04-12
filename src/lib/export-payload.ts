import { formatDuration } from "@/lib/pricing";
import { getLanguageLabel } from "@/lib/languages";
import { applySpeakerNames } from "@/lib/speaker-names";
import { resolveExportBaseName } from "@/lib/export-filename";
import type { CanonicalExportData, QAEntry } from "@/lib/export-types";

export interface CanonicalPayloadInput {
  /** Job title set by user or generated */
  jobTitle: string | null;
  /** Auto-generated title (fallback) */
  generatedTitle: string | null;
  /** Original uploaded file name */
  originalFileName: string | null;
  /** ISO timestamp: recorded_at ?? created_at */
  createdAt: string | null;
  /** Raw duration in seconds */
  durationSeconds: number | null;
  /** Detected language code */
  languageCode: string | null;
  /** Speaker name overrides */
  speakerNames: Record<string, string>;
  /** Raw transcript text */
  transcript: string | null;
  /** Raw summary text */
  summary: string | null;
  /** All Q&A output entries */
  questionEntries: { id: string; prompt: string | null; content: string }[];
  /** IDs of excluded Q&A items */
  excludedQAIds: Set<string>;
}

export function buildCanonicalPayload(input: CanonicalPayloadInput): CanonicalExportData {
  const title = resolveExportBaseName({
    jobTitle: input.jobTitle,
    generatedTitle: input.generatedTitle,
    originalFileName: input.originalFileName,
  });

  const createdAt = input.createdAt
    ? new Date(input.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

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

  return { title, createdAt, duration, language, summary, questions, transcript };
}
