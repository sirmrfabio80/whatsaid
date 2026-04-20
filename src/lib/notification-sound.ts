/**
 * Tiny WebAudio chime — no asset, no network, ~0.4s.
 * Two-tone soft "ding" at low volume. Used as a completion cue.
 *
 * The user can mute it from Settings; the preference is stored per-device in
 * localStorage (sound is inherently device-specific).
 */

const STORAGE_KEY = "ws.notif.sound";

export function isNotificationSoundEnabled(): boolean {
  try {
    // Default ON unless explicitly disabled
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let cachedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!cachedCtx) {
    try {
      cachedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return cachedCtx;
}

/**
 * Play a short two-tone chime (E5 → A5) at low volume.
 * No-op when disabled, when audio isn't supported, or when autoplay is blocked.
 */
export function playCompletionChime(force = false): void {
  if (!force && !isNotificationSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context (required after user-gesture suspension on some browsers)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.12; // low volume, deliberately subtle
  masterGain.connect(ctx.destination);

  // Two soft sine tones, slightly overlapping
  const tones: { freq: number; start: number; dur: number }[] = [
    { freq: 659.25, start: 0, dur: 0.18 },   // E5
    { freq: 880.0, start: 0.12, dur: 0.28 }, // A5
  ];

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    // Gentle attack/release so it doesn't click
    gain.gain.setValueAtTime(0.0001, now + tone.start);
    gain.gain.exponentialRampToValueAtTime(1.0, now + tone.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
    osc.connect(gain).connect(masterGain);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.02);
  }
}
