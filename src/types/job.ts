/**
 * Shared job-related types.
 *
 * Kept out of component files so non-React modules (libs, hooks)
 * and pages can import them without pulling component code.
 */

export interface JobMeta {
  language_detected: string | null;
  summary_language: string | null;
  duration_seconds: number | null;
  file_name: string;
  created_at: string;
  recorded_at: string | null;
  recorded_at_source: string | null;
  speech_model: string | null;
  speaker_names: Record<string, string>;
  title: string | null;
  metadata_location_iso6709: string | null;
  location_label: string | null;
  output_language: string | null;
}
