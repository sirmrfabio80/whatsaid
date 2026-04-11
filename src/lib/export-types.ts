export interface QAEntry {
  prompt: string | null;
  answer: string;
}

export interface ExportPayload {
  fileName: string;
  jobTitle: string | null;
  generatedTitle: string | null;
  originalFileName: string | null;
  language: string | null;
  durationSeconds: number | null;
  createdAt: string | null;
  transcript: string | null;
  summary: string | null;
  customPrompt: string | null;
  customOutput: string | null;
  questions?: QAEntry[];
}