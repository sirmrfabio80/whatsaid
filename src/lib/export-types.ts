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

/** Canonical export data — all values are display-rendered, not raw. */
export interface CanonicalExportData {
  title: string;
  createdAt: string;
  duration: string | null;
  language: string | null;
  /**
   * De-duplicated speaker labels (with renames already applied) in
   * first-appearance order. Empty / undefined = no speakers section.
   */
  speakers?: string[];
  summary: string | null;
  questions: QAEntry[] | null;
  transcript: string | null;
}
