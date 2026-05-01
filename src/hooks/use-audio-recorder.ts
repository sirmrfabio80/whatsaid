/**
 * useAudioRecorder — headless in-browser audio recording.
 *
 * - getUserMedia({ audio: true }) requested only when start() is called
 * - MediaRecorder with 5s timeslice; chunks persisted to IndexedDB
 * - Screen Wake Lock acquired after start, released on stop/cancel/error
 * - Visibility + track-end transitions to "interrupted" so the user can resume
 * - stop() finalises into a single File ready for the existing upload flow
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendChunk,
  clearSession,
  purgeStaleChunks,
  readAllChunks,
} from "@/lib/recorder-storage";
import {
  buildRecordingFileName,
  checkRecordingSupport,
  pickBestMimeType,
} from "@/lib/recorder-support";

export type RecorderStatus =
  | "idle"
  | "unsupported"
  | "requesting"
  | "recording"
  | "paused"
  | "interrupted"
  | "processing"
  | "ready"
  | "error";

export type RecorderErrorCode =
  | "permission_denied"
  | "no_mic"
  | "track_ended"
  | "storage"
  | "unsupported"
  | "unknown";

const TIMESLICE_MS = 5000;
const LEVEL_INTERVAL_MS = 100;

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
  removeEventListener: (type: "release", cb: () => void) => void;
}

interface UseAudioRecorderResult {
  status: RecorderStatus;
  errorCode: RecorderErrorCode | null;
  errorMessage: string | null;
  elapsedMs: number;
  levelRms: number;
  mimeType: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<{ file: File; durationSeconds: number } | null>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [errorCode, setErrorCode] = useState<RecorderErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levelRms, setLevelRms] = useState(0);
  const [mimeType, setMimeType] = useState<string | null>(null);

  // Refs for things that must not trigger re-render
  const sessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartedAtRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const statusRef = useRef<RecorderStatus>("idle");
  const finalisingRef = useRef(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const setStatusBoth = useCallback((s: RecorderStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // ── Support detection on mount ─────────────────────────────────────────────
  useEffect(() => {
    const sup = checkRecordingSupport();
    if (!sup.supported) {
      setStatusBoth("unsupported");
      setErrorCode("unsupported");
    }
    // Best-effort cleanup of any stale sessions from previous visits
    void purgeStaleChunks();
  }, [setStatusBoth]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const stopLevelMeter = useCallback(() => {
    if (levelTimerRef.current != null) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    setLevelRms(0);
  }, []);

  const startLevelMeter = useCallback(() => {
    stopLevelMeter();
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    levelTimerRef.current = window.setInterval(() => {
      if (statusRef.current !== "recording") return;
      analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Light smoothing for a calmer meter
      setLevelRms((prev) => prev * 0.6 + rms * 0.4);
    }, LEVEL_INTERVAL_MS);
  }, [stopLevelMeter]);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current != null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (segmentStartedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
      segmentStartedAtRef.current = null;
    }
    setElapsedMs(accumulatedMsRef.current);
  }, []);

  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current != null) return;
    segmentStartedAtRef.current = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      const seg = segmentStartedAtRef.current
        ? Date.now() - segmentStartedAtRef.current
        : 0;
      setElapsedMs(accumulatedMsRef.current + seg);
    }, 250);
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!lock) return;
    try {
      await lock.release();
    } catch {
      // Ignore
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl || typeof wl.request !== "function") return;
    try {
      const sentinel = await wl.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        // OS released the lock — usually because the page became hidden.
        // We don't change status here; visibility handler is the source of truth.
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch {
      // Wake Lock can fail (denied, unsupported on iOS < 16.4) — ignore.
    }
  }, []);

  const teardownStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      }
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
  }, []);

  // ── Visibility handling ────────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      // If actively recording, pause and mark interrupted so the user can resume.
      if (statusRef.current === "recording") {
        try {
          recorderRef.current?.pause();
        } catch {
          // Ignore
        }
        stopLevelMeter();
        if (segmentStartedAtRef.current != null) {
          accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
          segmentStartedAtRef.current = null;
        }
        if (elapsedTimerRef.current != null) {
          window.clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }
        setStatusBoth("interrupted");
        void releaseWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [releaseWakeLock, setStatusBoth, stopLevelMeter]);

  // ── Beforeunload guard ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const s = statusRef.current;
      if (s === "recording" || s === "paused" || s === "interrupted") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // Ignore
      }
      stopLevelMeter();
      if (elapsedTimerRef.current != null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      teardownStream();
      void releaseWakeLock();
      const sid = sessionIdRef.current;
      // If we're not in a finalisable state, drop chunks.
      if (sid && statusRef.current !== "ready" && !finalisingRef.current) {
        void clearSession(sid);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Acquire mic + create MediaRecorder + wire events.
   * If `preserveSession` is true we keep the existing sessionId, chunk index,
   * and accumulated elapsed time — used when resuming after an interruption
   * where the previous MediaRecorder went inactive (e.g. iOS lock, OS muted
   * the track). Returns true on success, false on failure (status already set).
   */
  const prepareRecorder = useCallback(
    async (preserveSession: boolean, preferredMime?: string | null): Promise<boolean> => {
      const sup = checkRecordingSupport();
      if (!sup.supported) {
        setStatusBoth("unsupported");
        setErrorCode("unsupported");
        return false;
      }
      setErrorCode(null);
      setErrorMessage(null);
      setStatusBoth("requesting");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        const code: RecorderErrorCode =
          name === "NotAllowedError" || name === "SecurityError"
            ? "permission_denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "no_mic"
              : "unknown";
        setErrorCode(code);
        setErrorMessage(
          code === "permission_denied"
            ? "Microphone permission was denied."
            : code === "no_mic"
              ? "No microphone was found on this device."
              : (err as Error)?.message ?? "Could not access the microphone.",
        );
        setStatusBoth(preserveSession ? "interrupted" : "error");
        return false;
      }

      // Tear down any previous stream/context before swapping in the new one.
      teardownStream();
      streamRef.current = stream;

      // Set up analyser for level meter
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        // Level meter is non-critical
      }

      // Set up MediaRecorder. When resuming we try the original MIME first
      // so concatenated chunks have the same container.
      const targetMime = (preferredMime ?? "") || pickBestMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = targetMime
          ? new MediaRecorder(stream, { mimeType: targetMime })
          : new MediaRecorder(stream);
      } catch {
        // Original mime might not be supported on this fresh stream — fall back.
        try {
          const fallback = pickBestMimeType();
          recorder = fallback
            ? new MediaRecorder(stream, { mimeType: fallback })
            : new MediaRecorder(stream);
        } catch (err2) {
          teardownStream();
          setErrorCode("unknown");
          setErrorMessage((err2 as Error)?.message ?? "Could not start recorder.");
          setStatusBoth("error");
          return false;
        }
      }

      const actualMime = recorder.mimeType || targetMime || "";
      // Only update mime on a fresh session so we don't lie about a resumed
      // session's container if the browser swapped it.
      if (!preserveSession) setMimeType(actualMime);
      recorderRef.current = recorder;

      if (!preserveSession) {
        // Fresh session
        const sessionId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionIdRef.current = sessionId;
        chunkIndexRef.current = 0;
        accumulatedMsRef.current = 0;
        segmentStartedAtRef.current = null;
        setElapsedMs(0);
        finalisingRef.current = false;
      }
      // When preserveSession=true we keep sessionIdRef, chunkIndexRef and
      // accumulatedMsRef as-is so the new chunks append after the old ones.

      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        const idx = chunkIndexRef.current;
        chunkIndexRef.current = idx + 1;
        const sid = sessionIdRef.current;
        if (!sid) return;
        writeQueueRef.current = writeQueueRef.current
          .then(() => appendChunk(sid, idx, ev.data))
          .catch((err) => {
            console.error("[recorder] chunk write failed:", err);
            setErrorCode("storage");
            setErrorMessage("Could not save recording chunk.");
            setStatusBoth("error");
            try {
              recorderRef.current?.stop();
            } catch {
              // Ignore
            }
          });
      };

      recorder.onerror = (ev) => {
        console.error("[recorder] error event:", ev);
        setErrorCode("unknown");
        setErrorMessage("Recording failed unexpectedly.");
        setStatusBoth("error");
      };

      // Track ended (e.g. permission revoked, OS muted)
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((t) => {
        t.onended = () => {
          if (statusRef.current === "recording" || statusRef.current === "paused") {
            try {
              recorderRef.current?.pause();
            } catch {
              // Ignore
            }
            stopLevelMeter();
            if (segmentStartedAtRef.current != null) {
              accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
              segmentStartedAtRef.current = null;
            }
            if (elapsedTimerRef.current != null) {
              window.clearInterval(elapsedTimerRef.current);
              elapsedTimerRef.current = null;
            }
            setErrorCode("track_ended");
            setStatusBoth("interrupted");
          }
        };
      });

      try {
        recorder.start(TIMESLICE_MS);
      } catch (err) {
        teardownStream();
        setErrorCode("unknown");
        setErrorMessage((err as Error)?.message ?? "Could not start recorder.");
        setStatusBoth("error");
        return false;
      }

      setStatusBoth("recording");
      startElapsedTimer();
      startLevelMeter();
      void acquireWakeLock();
      return true;
    },
    [
      acquireWakeLock,
      setStatusBoth,
      startElapsedTimer,
      startLevelMeter,
      stopLevelMeter,
      teardownStream,
    ],
  );

  const start = useCallback(async () => {
    await prepareRecorder(false);
  }, [prepareRecorder]);


  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (!r || statusRef.current !== "recording") return;
    try {
      r.pause();
    } catch {
      // Ignore
    }
    stopLevelMeter();
    if (segmentStartedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
      segmentStartedAtRef.current = null;
    }
    if (elapsedTimerRef.current != null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setStatusBoth("paused");
    void releaseWakeLock();
  }, [releaseWakeLock, setStatusBoth, stopLevelMeter]);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (statusRef.current !== "paused" && statusRef.current !== "interrupted") return;

    // If recorder is still alive (paused), just resume. If it's "inactive"
    // (e.g. after a track ended), we cannot resume the same recorder — surface
    // an error so the user knows to stop & finalise what they have.
    if (r.state === "paused") {
      try {
        r.resume();
        setStatusBoth("recording");
        startElapsedTimer();
        startLevelMeter();
        void acquireWakeLock();
        setErrorCode(null);
        setErrorMessage(null);
      } catch {
        setErrorCode("unknown");
        setErrorMessage("Could not resume recording.");
        setStatusBoth("error");
      }
    } else {
      // Recorder is inactive — cannot resume. The user should Stop to finalise
      // whatever they already have.
      setErrorCode("track_ended");
      setErrorMessage("Recording can't be resumed. Tap Stop to finalise what's been captured.");
      setStatusBoth("interrupted");
    }
  }, [acquireWakeLock, setStatusBoth, startElapsedTimer, startLevelMeter]);

  const stop = useCallback(async (): Promise<{ file: File; durationSeconds: number } | null> => {
    const r = recorderRef.current;
    const sid = sessionIdRef.current;
    if (!r || !sid) return null;

    finalisingRef.current = true;
    setStatusBoth("processing");
    stopLevelMeter();

    // Capture elapsed time at the moment of stop
    if (segmentStartedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
      segmentStartedAtRef.current = null;
    }
    if (elapsedTimerRef.current != null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    const finalElapsedMs = accumulatedMsRef.current;
    setElapsedMs(finalElapsedMs);

    // Wait for recorder to fully stop and flush its last chunk
    if (r.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const onStop = () => {
          r.removeEventListener("stop", onStop);
          resolve();
        };
        r.addEventListener("stop", onStop);
        try {
          r.stop();
        } catch {
          resolve();
        }
      });
    }

    // Wait for any pending chunk writes to finish
    try {
      await writeQueueRef.current;
    } catch {
      // Already surfaced
    }

    teardownStream();
    await releaseWakeLock();

    let file: File;
    try {
      const chunks = await readAllChunks(sid);
      if (chunks.length === 0) {
        setErrorCode("storage");
        setErrorMessage("No audio was captured.");
        setStatusBoth("error");
        return null;
      }
      const mime = mimeType || chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      const filename = buildRecordingFileName(mime);
      file = new File([blob], filename, { type: mime, lastModified: Date.now() });
    } catch (err) {
      console.error("[recorder] finalise failed:", err);
      setErrorCode("storage");
      setErrorMessage("Could not assemble the recording.");
      setStatusBoth("error");
      return null;
    }

    // Chunks are no longer needed
    void clearSession(sid).catch(() => {});
    sessionIdRef.current = null;
    finalisingRef.current = false;

    setStatusBoth("ready");
    return { file, durationSeconds: Math.max(1, Math.round(finalElapsedMs / 1000)) };
  }, [mimeType, releaseWakeLock, setStatusBoth, stopLevelMeter, teardownStream]);

  const cancel = useCallback(async () => {
    const r = recorderRef.current;
    const sid = sessionIdRef.current;
    finalisingRef.current = false;

    stopLevelMeter();
    if (elapsedTimerRef.current != null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    accumulatedMsRef.current = 0;
    segmentStartedAtRef.current = null;
    setElapsedMs(0);

    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        // Ignore
      }
    }
    teardownStream();
    await releaseWakeLock();
    if (sid) {
      try {
        await clearSession(sid);
      } catch {
        // Ignore
      }
    }
    sessionIdRef.current = null;
    recorderRef.current = null;
    setMimeType(null);
    setErrorCode(null);
    setErrorMessage(null);
    setStatusBoth("idle");
  }, [releaseWakeLock, setStatusBoth, stopLevelMeter, teardownStream]);

  const reset = useCallback(() => {
    if (statusRef.current === "ready" || statusRef.current === "error") {
      sessionIdRef.current = null;
      recorderRef.current = null;
      setMimeType(null);
      setErrorCode(null);
      setErrorMessage(null);
      accumulatedMsRef.current = 0;
      setElapsedMs(0);
      setStatusBoth("idle");
    }
  }, [setStatusBoth]);

  return {
    status,
    errorCode,
    errorMessage,
    elapsedMs,
    levelRms,
    mimeType,
    start,
    pause,
    resume,
    stop,
    cancel,
    reset,
  };
}
