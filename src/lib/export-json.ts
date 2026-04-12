import type { CanonicalExportData } from "@/lib/export-types";

export function buildJson(data: CanonicalExportData): string {
  const obj: Record<string, unknown> = {
    title: data.title,
    date: data.createdAt,
  };

  if (data.duration) obj.duration = data.duration;
  if (data.language) obj.language = data.language;
  if (data.summary) obj.summary = data.summary;

  if (data.questions && data.questions.length > 0) {
    obj.questions = data.questions.map((qa) => ({
      question: qa.prompt,
      answer: qa.answer,
    }));
  }

  if (data.transcript) obj.transcript = data.transcript;

  return JSON.stringify(obj, null, 2);
}
