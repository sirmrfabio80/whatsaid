/**
 * Credit model — single source of truth.
 *
 * Rule: 1 credit covers up to 120 minutes of audio in a single file.
 * Files longer than 120 minutes cost +1 credit per additional 120-minute block
 * (e.g. 121–240 min = 2 credits, 241–360 min = 3 credits).
 *
 * Hard ceiling: 480 minutes per file (4 credits max), enforced via MAX_DURATION.
 */
export const MINUTES_PER_CREDIT = 120;

/** Calculate credits needed based on audio duration. */
export function creditsForDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  const minutes = durationSeconds / 60;
  return Math.max(1, Math.ceil(minutes / MINUTES_PER_CREDIT));
}


/** Format seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Max file size in bytes (100MB) */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Max duration in seconds (480 min = 8 h, i.e. up to 4 credits per file). */
export const MAX_DURATION = 480 * 60;

/** Accepted audio MIME types */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
];

/** Accepted file extensions */
export const ACCEPTED_EXTENSIONS = [".m4a", ".mp3", ".wav"];

/** Validate file type */
export function isValidAudioFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.includes(ext) || ACCEPTED_AUDIO_TYPES.includes(file.type);
}
