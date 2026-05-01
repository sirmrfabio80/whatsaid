/**
 * Browser support helpers for in-browser audio recording.
 * Pure functions, no side effects, safe to import anywhere.
 */

const PREFERRED_MIME_TYPES: ReadonlyArray<string> = [
  // Safari/iOS — direct .m4a-compatible container
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  // Chrome/Android/Firefox
  "audio/webm;codecs=opus",
  "audio/webm",
  // Older Firefox
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export interface RecordingSupport {
  supported: boolean;
  reason?: "no_mediadevices" | "no_getusermedia" | "no_mediarecorder" | "insecure_context";
}

/**
 * Detect whether the current browser can record audio at all.
 * Does not request mic permission.
 */
export function checkRecordingSupport(): RecordingSupport {
  if (typeof window === "undefined") return { supported: false, reason: "no_mediadevices" };
  // Mic capture requires a secure context (https or localhost)
  if (window.isSecureContext === false) {
    return { supported: false, reason: "insecure_context" };
  }
  if (!navigator.mediaDevices) return { supported: false, reason: "no_mediadevices" };
  if (typeof navigator.mediaDevices.getUserMedia !== "function") {
    return { supported: false, reason: "no_getusermedia" };
  }
  if (typeof window.MediaRecorder === "undefined") {
    return { supported: false, reason: "no_mediarecorder" };
  }
  return { supported: true };
}

/**
 * Choose the best MediaRecorder MIME type the browser supports.
 * Returns "" if none of the preferred types are explicitly supported —
 * MediaRecorder will then pick a default.
 */
export function pickBestMimeType(): string {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return "";
  for (const mime of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // Some older browsers throw on unknown types — keep going
    }
  }
  return "";
}

/**
 * Map a MediaRecorder MIME type to a sensible file extension.
 * .m4a is preferred for mp4 because it's the format users recognise and
 * the existing pipeline already accepts it first-class.
 */
export function mimeToExtension(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp4")) return "m4a";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * Build a friendly default filename for a recording, e.g.
 * "recording-20260427-143012.m4a"
 */
export function buildRecordingFileName(mime: string, date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `recording-${stamp}.${mimeToExtension(mime)}`;
}
