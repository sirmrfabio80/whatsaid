/**
 * Streaming audio enhancement: decode on the main thread (briefly), then ship
 * channel data into a Web Worker that does normalisation + soft-clip + MP3
 * encoding. Keeps the heavy per-sample loops off the main thread so long
 * uploads don't freeze the browser.
 *
 * Falls back / rejects on:
 *   - Worker construction failure (unsupported environment)
 *   - 6-minute timeout
 *   - Decode failure
 *   - Worker error message
 */

import { sanitizeStorageFilename } from "./sanitize-filename";
import type {
  AudioEnhanceOptions,
  AudioEnhanceResult,
  AudioEnhanceMetadata,
} from "./audio-enhance";

const WORKER_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes

type WorkerOutMessage =
  | { type: "stage"; stage: "decoding" | "processing" | "encoding" }
  | {
      type: "done";
      blob: Blob;
      reason: "applied" | "noise_gated" | "below_normalise_threshold";
      applied: boolean;
      inputChannels: 1 | 2;
      measured: AudioEnhanceMetadata["measured"];
    }
  | { type: "error"; message: string };

async function decodeOnMainThread(file: File): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const AudioCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) throw new Error("AudioContext unavailable");
  const ctx = new AudioCtor();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(arrayBuffer);
    const numChannels = buf.numberOfChannels === 1 ? 1 : 2;
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      // Copy out — getChannelData returns a view tied to the AudioBuffer
      // which we want to release via ctx.close().
      const src = buf.getChannelData(i);
      const copy = new Float32Array(src.length);
      copy.set(src);
      channels.push(copy);
    }
    return { channels, sampleRate: buf.sampleRate };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function enhanceAudioInWorker(
  file: File,
  onProgress: ((stage: "decoding" | "processing" | "encoding") => void) | undefined,
  options: AudioEnhanceOptions,
): Promise<AudioEnhanceResult> {
  const t0 = performance.now();

  onProgress?.("decoding");
  const { channels, sampleRate } = await decodeOnMainThread(file);

  const worker = new Worker(new URL("./audio-enhance.worker.ts", import.meta.url), {
    type: "module",
  });

  const safeBase = sanitizeStorageFilename(file.name.replace(/\.[^.]+$/, "")).replace(/\.mp3$/i, "");
  const enhancedFileName = `${safeBase}_normalised.mp3`;

  return new Promise<AudioEnhanceResult>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error("Worker enhancement timed out"));
    }, WORKER_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.terminate();
    };

    worker.addEventListener("message", (event: MessageEvent<WorkerOutMessage>) => {
      const data = event.data;
      if (settled) return;
      if (data.type === "stage") {
        onProgress?.(data.stage);
        return;
      }
      if (data.type === "error") {
        settled = true;
        cleanup();
        reject(new Error(data.message));
        return;
      }
      if (data.type === "done") {
        settled = true;
        cleanup();
        const file = new File([data.blob], enhancedFileName, { type: "audio/mpeg" });
        const metadata: AudioEnhanceMetadata = {
          applied: data.applied,
          reason: data.reason,
          input_channels: data.inputChannels,
          duration_ms: Math.round(performance.now() - t0),
          measured: data.measured,
        };
        resolve({ file, metadata });
      }
    });

    worker.addEventListener("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(err.message || "Worker error"));
    });

    // Transfer channel buffers to avoid copying.
    const transferables = channels.map((c) => c.buffer);
    worker.postMessage(
      { type: "enhance", channels, sampleRate, options },
      transferables,
    );
  });
}
