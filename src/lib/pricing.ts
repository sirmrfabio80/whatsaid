/** Calculate credits needed based on audio duration */
export function creditsForDuration(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  if (minutes <= 15) return 1;
  if (minutes <= 30) return 2;
  if (minutes <= 45) return 3;
  return 4;
}


/** Format seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Max file size in bytes (200MB) */
export const MAX_FILE_SIZE = 200 * 1024 * 1024;

/** Max duration in seconds (60 min) */
export const MAX_DURATION = 3600;

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

/** Credit pack definitions */
export const CREDIT_PACKS = [
  { credits: 5, price: 11.99, perCredit: 2.40, label: "Starter" },
  { credits: 15, price: 29.99, perCredit: 2.00, label: "Pro" },
  { credits: 40, price: 59.99, perCredit: 1.50, label: "Power" },
] as const;
