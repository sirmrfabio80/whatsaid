/**
 * Module-level singleton playback manager for browser speech synthesis.
 *
 * Why a singleton: only one playback session may exist across the entire
 * page at any time. We do NOT want individual ListenButton unmounts to
 * cancel playback — only explicit user actions (stop), tab changes, or
 * page-level navigation should stop speech.
 *
 * The hook simply subscribes to manager state and re-renders. Unmounting
 * a ListenButton only unsubscribes its listener; it never touches playback.
 */

import { useEffect, useState, useCallback } from "react";

export type SpeechState = "idle" | "playing" | "paused";

interface ManagerSnapshot {
  state: SpeechState;
  activeOwner: string | null;
}

type Listener = (snapshot: ManagerSnapshot) => void;

const isBrowser = typeof window !== "undefined";
const isSupported = isBrowser && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";

// ---------- Listening preferences (singleton) ----------
// Source of truth for user preferences applied to every utterance.
// Updated from AuthContext after profile load and from Settings on save / Test action.
export type PreferredVoice = "male" | "female";
interface SpeechPreferences {
  voice: PreferredVoice;
  rate: number;
}
const preferences: SpeechPreferences = { voice: "female", rate: 1.0 };

export function setSpeechPreferences(prefs: Partial<SpeechPreferences>): void {
  if (prefs.voice === "male" || prefs.voice === "female") preferences.voice = prefs.voice;
  if (typeof prefs.rate === "number" && Number.isFinite(prefs.rate)) {
    preferences.rate = Math.min(2, Math.max(0.5, prefs.rate));
  }
}

// ---------- Voices cache ----------
let voicesCache: SpeechSynthesisVoice[] = [];
let voicesListenerAttached = false;
const voicesListeners = new Set<() => void>();

function emitVoicesChanged(): void {
  voicesListeners.forEach((l) => l());
}

function refreshVoicesCache(): SpeechSynthesisVoice[] {
  if (!isSupported) return [];
  voicesCache = window.speechSynthesis.getVoices() ?? [];
  return voicesCache;
}

if (isSupported) {
  refreshVoicesCache();
  if (voicesCache.length === 0 && !voicesListenerAttached) {
    voicesListenerAttached = true;
    const handler = () => {
      refreshVoicesCache();
      emitVoicesChanged();
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      voicesListenerAttached = false;
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
  }
}

/** Subscribe to voice-cache readiness updates. Returns an unsubscribe fn. */
export function subscribeVoices(listener: () => void): () => void {
  voicesListeners.add(listener);
  return () => {
    voicesListeners.delete(listener);
  };
}

/** Returns the current cached voices (may be empty before voiceschanged fires). */
export function getCachedVoices(): SpeechSynthesisVoice[] {
  return voicesCache;
}

// Gender heuristic — best-effort only. Browser voice metadata is inconsistent
// across OS/Chrome/Safari/Firefox, so mismatches are expected; we fall back gracefully.
const FEMALE_NAME_RE = /female|woman|samantha|victoria|karen|fiona|moira|tessa|zira|hazel|amelie|amélie|audrey|virginie|alice|carla|federica|paola/i;
const MALE_NAME_RE = /\b(male|man|daniel|alex|fred|tom|david|mark|thomas|nicolas|sébastien|sebastien|paul|luca|cosimo|diego)\b/i;

/**
 * Pick the closest available voice using a deterministic order:
 * 1. Exact language match (e.g. "en-US" === "en-US")
 * 2. Same language family (prefix, e.g. "en")
 * 3. Within candidates, prefer voice.localService === true
 * 4. Within remaining candidates, apply gender name heuristic
 * 5. Browser default (return undefined)
 */
export function pickVoice(lang: string | undefined, gender: PreferredVoice): SpeechSynthesisVoice | undefined {
  if (!isSupported) return undefined;
  const all = voicesCache.length ? voicesCache : refreshVoicesCache();
  if (all.length === 0) return undefined;

  const requested = (lang || "").toLowerCase();
  const requestedPrefix = requested.split("-")[0];

  // 1. Exact language match
  let candidates = requested ? all.filter((v) => v.lang?.toLowerCase() === requested) : [];
  // 2. Same language family
  if (candidates.length === 0 && requestedPrefix) {
    candidates = all.filter((v) => v.lang?.toLowerCase().split("-")[0] === requestedPrefix);
  }
  // Fallback: any voice
  if (candidates.length === 0) candidates = all;

  // 3. Prefer local-service voices when available
  const local = candidates.filter((v) => v.localService);
  const pool = local.length > 0 ? local : candidates;

  // 4. Gender heuristic
  const re = gender === "female" ? FEMALE_NAME_RE : MALE_NAME_RE;
  const genderMatch = pool.find((v) => re.test(v.name));
  if (genderMatch) return genderMatch;

  // 5. Browser default — let UA pick
  return undefined;
}

interface Manager {
  state: SpeechState;
  activeOwner: string | null;
  utterances: SpeechSynthesisUtterance[];
  heartbeat: ReturnType<typeof setInterval> | null;
  listeners: Set<Listener>;
  subscribe(listener: Listener): () => void;
  emit(): void;
  startHeartbeat(): void;
  stopHeartbeat(): void;
  play(ownerId: string, text: string, lang?: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

const manager: Manager = {
  state: "idle",
  activeOwner: null,
  utterances: [],
  heartbeat: null,
  listeners: new Set<Listener>(),

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },

  emit() {
    const snapshot: ManagerSnapshot = { state: this.state, activeOwner: this.activeOwner };
    this.listeners.forEach((l) => l(snapshot));
  },

  // Chrome silently stops long utterances after ~15s. Pulsing pause/resume
  // keeps the queue alive. Only run while actively playing.
  startHeartbeat() {
    if (!isSupported || this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.state === "playing" && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10_000);
  },

  stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  },

  play(ownerId, text, lang) {
    if (!isSupported) return;
    // Always cancel any prior session — only one playback at a time.
    window.speechSynthesis.cancel();
    this.stopHeartbeat();
    this.utterances = [];

    const chunks = chunkForSpeech(text);
    if (chunks.length === 0) {
      this.state = "idle";
      this.activeOwner = null;
      this.emit();
      return;
    }

    this.activeOwner = ownerId;
    this.state = "playing";

    const chosenVoice = pickVoice(lang, preferences.voice);

    chunks.forEach((chunk, idx) => {
      const utt = new SpeechSynthesisUtterance(chunk);
      if (lang) utt.lang = lang;
      if (chosenVoice) utt.voice = chosenVoice;
      utt.rate = preferences.rate;
      utt.pitch = 1;
      if (idx === chunks.length - 1) {
        utt.onend = () => {
          // Only clear if still the active owner (guards against race with stop()).
          if (this.activeOwner === ownerId) {
            this.state = "idle";
            this.activeOwner = null;
            this.utterances = [];
            this.stopHeartbeat();
            this.emit();
          }
        };
      }
      utt.onerror = () => {
        if (this.activeOwner === ownerId) {
          this.state = "idle";
          this.activeOwner = null;
          this.utterances = [];
          this.stopHeartbeat();
          this.emit();
        }
      };
      this.utterances.push(utt);
      window.speechSynthesis.speak(utt);
    });

    this.startHeartbeat();
    this.emit();
  },

  pause() {
    if (!isSupported || this.state !== "playing") return;
    window.speechSynthesis.pause();
    this.state = "paused";
    this.stopHeartbeat();
    this.emit();
  },

  resume() {
    if (!isSupported || this.state !== "paused") return;
    window.speechSynthesis.resume();
    this.state = "playing";
    this.startHeartbeat();
    this.emit();
  },

  stop() {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    this.utterances = [];
    this.stopHeartbeat();
    if (this.state !== "idle" || this.activeOwner !== null) {
      this.state = "idle";
      this.activeOwner = null;
      this.emit();
    }
  },
};

/**
 * Chunk text for speechSynthesis utterances.
 * Strategy: paragraph-first, sentence-second, comma fallback.
 * Target: ≤600 chars per chunk → natural prosody, far fewer audible seams
 * than fixed small chunks.
 */
export function chunkForSpeech(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const TARGET = 600;
  const FLOOR = 400;
  const out: string[] = [];

  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  for (const para of paragraphs) {
    if (para.length <= TARGET) {
      out.push(para);
      continue;
    }
    // Split into sentences and greedily pack.
    const sentences = para.match(/[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/g) ?? [para];
    let buffer = "";
    for (const sentRaw of sentences) {
      const sent = sentRaw.trim();
      if (!sent) continue;
      if (sent.length > TARGET) {
        // flush buffer first
        if (buffer) {
          out.push(buffer.trim());
          buffer = "";
        }
        // sentence too long → split on commas/clauses with FLOOR target
        const clauses = sent.split(/,\s+/);
        let cBuf = "";
        for (const clause of clauses) {
          if ((cBuf + ", " + clause).length > FLOOR && cBuf) {
            out.push(cBuf.trim());
            cBuf = clause;
          } else {
            cBuf = cBuf ? `${cBuf}, ${clause}` : clause;
          }
        }
        if (cBuf) out.push(cBuf.trim());
        continue;
      }
      if ((buffer + " " + sent).length > TARGET && buffer) {
        out.push(buffer.trim());
        buffer = sent;
      } else {
        buffer = buffer ? `${buffer} ${sent}` : sent;
      }
    }
    if (buffer) out.push(buffer.trim());
  }

  return out;
}

export interface UseSpeechSynthesis {
  isSupported: boolean;
  state: SpeechState;
  activeOwner: string | null;
  isActiveOwner: (ownerId: string) => boolean;
  play: (ownerId: string, text: string, lang?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesis {
  const [snapshot, setSnapshot] = useState<ManagerSnapshot>(() => ({
    state: manager.state,
    activeOwner: manager.activeOwner,
  }));

  useEffect(() => {
    // Only subscribe — never cancel playback on unmount of an individual subscriber.
    const unsubscribe = manager.subscribe(setSnapshot);
    return unsubscribe;
  }, []);

  const isActiveOwner = useCallback(
    (ownerId: string) => snapshot.activeOwner === ownerId,
    [snapshot.activeOwner],
  );

  const play = useCallback((ownerId: string, text: string, lang?: string) => {
    manager.play(ownerId, text, lang);
  }, []);
  const pause = useCallback(() => manager.pause(), []);
  const resume = useCallback(() => manager.resume(), []);
  const stop = useCallback(() => manager.stop(), []);

  return {
    isSupported,
    state: snapshot.state,
    activeOwner: snapshot.activeOwner,
    isActiveOwner,
    play,
    pause,
    resume,
    stop,
  };
}

/** Direct access to the singleton — useful for page-level cleanup effects and the Settings test action. */
export const speechManager = {
  stop: () => manager.stop(),
  play: (ownerId: string, text: string, lang?: string) => manager.play(ownerId, text, lang),
  pause: () => manager.pause(),
  resume: () => manager.resume(),
};
