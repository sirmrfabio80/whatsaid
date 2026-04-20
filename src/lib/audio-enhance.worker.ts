/**
 * Web Worker for the CPU-heavy parts of audio enhancement:
 *   - RMS / peak measurement
 *   - Normalisation gain pass
 *   - Soft-clip limiter pass
 *   - MP3 encoding via @breezystack/lamejs
 *
 * Decoding stays on the main thread because `decodeAudioData` is not
 * available in workers across all browsers. The decoded channel data
 * is transferred (zero-copy) into the worker.
 */

import { Mp3Encoder } from "@breezystack/lamejs";
import type {
  AudioEnhanceOptions,
  AudioEnhanceMeasured,
  NormaliseMode,
} from "./audio-enhance";

export interface EnhanceWorkerRequest {
  type: "enhance";
  channels: Float32Array[];
  sampleRate: number;
  options: AudioEnhanceOptions;
}

export interface EnhanceWorkerSuccess {
  type: "success";
  mp3: ArrayBuffer;
  measured: AudioEnhanceMeasured;
  normalisationApplied: boolean;
  softClipped: boolean;
  reason: "applied" | "noise_gated" | "below_normalise_threshold";
}

export interface EnhanceWorkerError {
  type: "error";
  message: string;
}

export type EnhanceWorkerResponse = EnhanceWorkerSuccess | EnhanceWorkerError;

function linearToDbfs(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

function dbfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 20);
}

function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

function computeRMS(channels: Float32Array[]): number {
  let sumSq = 0;
  let count = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

function computePeak(channels: Float32Array[]): number {
  let maxSample = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxSample) maxSample = abs;
    }
  }
  return maxSample;
}

/**
 * Stream-encode Float32 channel data to MP3 without ever materialising a
 * full-length Int16 PCM buffer.
 *
 * Memory profile:
 *   - One ENCODE_CHUNK-sized Int16Array per channel (~9 KB each at 1152 frames × 4 batches).
 *   - Encoded MP3 chunks accumulated as a list of Uint8Array (output is small,
 *     ~2.4 MB/min stereo @ 320 kbps, vs ~21 MB/min for the Float32 PCM).
 *
 * Compared to the previous implementation, this removes the O(samples)
 * Int16Array allocation that doubled peak RAM during encode.
 */
function encodeMp3Streaming(
  channels: Float32Array[],
  sampleRate: number,
  bitrateKbps: number,
): ArrayBuffer {
  const numChannels = channels.length === 1 ? 1 : 2;
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps);
  const length = channels[0].length;
  const lCh = channels[0];
  const rCh = numChannels === 2 ? channels[1] : null;

  // Encode in MP3-frame multiples. 1152 samples = one MPEG Layer III frame.
  // Larger windows reduce per-call overhead; ~46 ms per chunk @ 48 kHz keeps
  // the worker responsive to incoming messages between iterations if needed.
  const FRAME = 1152;
  const FRAMES_PER_CHUNK = 4;
  const ENCODE_CHUNK = FRAME * FRAMES_PER_CHUNK; // 4608 samples

  // Reusable scratch buffers — allocate once, reuse every chunk.
  const leftScratch = new Int16Array(ENCODE_CHUNK);
  const rightScratch = rCh ? new Int16Array(ENCODE_CHUNK) : null;

  const chunks: Uint8Array[] = [];

  for (let off = 0; off < length; off += ENCODE_CHUNK) {
    const end = Math.min(off + ENCODE_CHUNK, length);
    const n = end - off;

    // Fused float→int16 conversion + slice into the scratch buffer.
    for (let i = 0; i < n; i++) {
      leftScratch[i] = floatToInt16(lCh[off + i]);
    }
    const lView = leftScratch.subarray(0, n);
    let rView: Int16Array | null = null;
    if (rightScratch && rCh) {
      for (let i = 0; i < n; i++) {
        rightScratch[i] = floatToInt16(rCh[off + i]);
      }
      rView = rightScratch.subarray(0, n);
    }

    const mp3buf = rView
      ? encoder.encodeBuffer(lView, rView)
      : encoder.encodeBuffer(lView);
    if (mp3buf.length > 0) {
      // Copy out — lamejs reuses an internal buffer between encodeBuffer calls,
      // so the returned view becomes invalid after the next call.
      chunks.push(new Uint8Array(mp3buf));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  // Concatenate into a single transferable ArrayBuffer.
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let writeOff = 0;
  for (const c of chunks) {
    out.set(c, writeOff);
    writeOff += c.length;
  }
  return out.buffer;
}

const MP3_BITRATE_KBPS = 320;

self.addEventListener("message", async (event: MessageEvent<EnhanceWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== "enhance") return;

  try {
    const { channels, sampleRate, options: opts } = msg;
    const inputChannels: 1 | 2 = channels.length === 1 ? 1 : 2;

    const NOISE_FLOOR = dbfsToLinear(opts.noise_floor_dbfs);
    const inputRms = computeRMS(channels);
    const inputPeak = computePeak(channels);
    const inputRmsDbfs = linearToDbfs(inputRms);
    const inputPeakDbfs = linearToDbfs(inputPeak);

    // Noise gate — encode untouched and return.
    if (inputRms < NOISE_FLOOR) {
      const mp3 = encodeMp3Streaming(channels, sampleRate, MP3_BITRATE_KBPS);
      const response: EnhanceWorkerSuccess = {
        type: "success",
        mp3,
        measured: {
          input_rms_dbfs: inputRmsDbfs,
          input_peak_dbfs: inputPeakDbfs,
          applied_gain_db: 0,
          output_rms_dbfs: inputRmsDbfs,
          output_peak_dbfs: inputPeakDbfs,
          soft_clip_samples_pct: 0,
          normalise_mode: opts.normalise_mode as NormaliseMode,
        },
        normalisationApplied: false,
        softClipped: false,
        reason: "noise_gated",
      };
      (self as unknown as Worker).postMessage(response, [mp3]);
      return;
    }

    // Normalisation gain
    const maxGainDb = inputChannels === 1 ? opts.max_gain_db_mono : opts.max_gain_db_stereo;
    const MAX_NORM_GAIN = dbfsToLinear(maxGainDb);

    let gain = 1.0;
    let normalisationApplied = false;

    if (opts.normalise) {
      let desiredGain = 1.0;
      if (opts.normalise_mode === "rms" && inputRms > 0) {
        desiredGain = dbfsToLinear(opts.target_rms_dbfs) / inputRms;
      } else if (opts.normalise_mode === "peak" && inputPeak > 0) {
        desiredGain = dbfsToLinear(opts.target_peak_dbfs) / inputPeak;
      }
      gain = Math.max(1.0, Math.min(desiredGain, MAX_NORM_GAIN));
      normalisationApplied = gain > 1.0;

      if (normalisationApplied) {
        for (const data of channels) {
          for (let i = 0; i < data.length; i++) data[i] *= gain;
        }
      }
    }
    const appliedGainDb = linearToDbfs(gain);

    const postGainRms = computeRMS(channels);
    const outputRmsDbfs = linearToDbfs(postGainRms);

    // Soft-clip limiter
    const CLIP_THRESHOLD = Math.max(0.5, Math.min(1.0, opts.soft_clip_threshold));
    let softClipSampleCount = 0;
    let totalSampleCount = 0;
    for (const data of channels) {
      totalSampleCount += data.length;
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > CLIP_THRESHOLD) {
          data[i] = CLIP_THRESHOLD * Math.tanh(data[i] / CLIP_THRESHOLD);
          softClipSampleCount++;
        }
      }
    }
    const softClipSamplesPct = totalSampleCount > 0
      ? (softClipSampleCount / totalSampleCount) * 100
      : 0;
    const softClipped = softClipSampleCount > 0;

    const outputPeak = computePeak(channels);
    const outputPeakDbfs = linearToDbfs(outputPeak);

    const mp3 = encodeMp3Streaming(channels, sampleRate, MP3_BITRATE_KBPS);

    const sampleModified = softClipped || normalisationApplied;

    const response: EnhanceWorkerSuccess = {
      type: "success",
      mp3,
      measured: {
        input_rms_dbfs: inputRmsDbfs,
        input_peak_dbfs: inputPeakDbfs,
        applied_gain_db: appliedGainDb,
        output_rms_dbfs: outputRmsDbfs,
        output_peak_dbfs: outputPeakDbfs,
        soft_clip_samples_pct: softClipSamplesPct,
        normalise_mode: opts.normalise_mode as NormaliseMode,
      },
      normalisationApplied,
      softClipped,
      reason: sampleModified ? "applied" : "below_normalise_threshold",
    };
    (self as unknown as Worker).postMessage(response, [mp3]);
  } catch (err) {
    const response: EnhanceWorkerError = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
});
