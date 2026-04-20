/**
 * Audio enhancement worker.
 *
 * Runs RMS / peak / gain / soft-clip loops + lamejs MP3 encoding off the main
 * thread so that long uploads don't freeze the browser. Decoding is done on
 * the main thread (workers don't have AudioContext access in all browsers) and
 * the resulting Float32 channel data is transferred in.
 *
 * Protocol:
 *   in:  { type: "enhance", channels: Float32Array[], sampleRate, options }
 *   out: { type: "stage", stage: "decoding" | "processing" | "encoding" }
 *        { type: "done", blob: Blob, metadata: { ... } }
 *        { type: "error", message: string }
 */

/// <reference lib="webworker" />

import type { AudioEnhanceOptions, AudioEnhanceMeasured, NormaliseMode } from "./audio-enhance";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const MP3_BITRATE_KBPS = 320;

interface WorkerInMessage {
  type: "enhance";
  channels: Float32Array[];
  sampleRate: number;
  options: AudioEnhanceOptions;
}

interface DoneMessage {
  type: "done";
  blob: Blob;
  reason: "applied" | "noise_gated" | "below_normalise_threshold";
  applied: boolean;
  inputChannels: 1 | 2;
  measured: AudioEnhanceMeasured;
}

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

async function encodeMp3(channels: Float32Array[], sampleRate: number): Promise<Blob> {
  // Dynamic import keeps lamejs out of the worker's startup cost.
  const lamejs = await import("@breezystack/lamejs");
  const Mp3Encoder = lamejs.Mp3Encoder;

  const numChannels = channels.length === 1 ? 1 : 2;
  const length = channels[0].length;
  const encoder = new Mp3Encoder(numChannels, sampleRate, MP3_BITRATE_KBPS);

  const left = new Int16Array(length);
  const right = numChannels === 2 ? new Int16Array(length) : null;

  const lCh = channels[0];
  const rCh = numChannels === 2 ? channels[1] : null;
  for (let i = 0; i < length; i++) {
    left[i] = floatToInt16(lCh[i]);
    if (right && rCh) right[i] = floatToInt16(rCh[i]);
  }

  const BLOCK = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < length; i += BLOCK) {
    const lChunk = left.subarray(i, i + BLOCK);
    const rChunk = right ? right.subarray(i, i + BLOCK) : null;
    const mp3buf = rChunk
      ? encoder.encodeBuffer(lChunk, rChunk)
      : encoder.encodeBuffer(lChunk);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as unknown as BlobPart[], { type: "audio/mpeg" });
}

ctx.addEventListener("message", async (event: MessageEvent<WorkerInMessage>) => {
  try {
    const { channels, sampleRate, options } = event.data;
    const inputChannels: 1 | 2 = channels.length === 1 ? 1 : 2;

    ctx.postMessage({ type: "stage", stage: "processing" });

    const NOISE_FLOOR = dbfsToLinear(options.noise_floor_dbfs);
    const inputRms = computeRMS(channels);
    const inputPeak = computePeak(channels);
    const inputRmsDbfs = linearToDbfs(inputRms);
    const inputPeakDbfs = linearToDbfs(inputPeak);

    // Noise gate: skip enhancement entirely if too quiet.
    if (inputRms < NOISE_FLOOR) {
      ctx.postMessage({ type: "stage", stage: "encoding" });
      const blob = await encodeMp3(channels, sampleRate);
      const done: DoneMessage = {
        type: "done",
        blob,
        reason: "noise_gated",
        applied: false,
        inputChannels,
        measured: {
          input_rms_dbfs: inputRmsDbfs,
          input_peak_dbfs: inputPeakDbfs,
          applied_gain_db: 0,
          output_rms_dbfs: inputRmsDbfs,
          output_peak_dbfs: inputPeakDbfs,
          soft_clip_samples_pct: 0,
          normalise_mode: options.normalise_mode,
        },
      };
      ctx.postMessage(done);
      return;
    }

    // Stage 1: normalisation gain
    const maxGainDb = inputChannels === 1 ? options.max_gain_db_mono : options.max_gain_db_stereo;
    const MAX_NORM_GAIN = dbfsToLinear(maxGainDb);
    let gain = 1.0;
    let normalisationApplied = false;
    if (options.normalise) {
      let desiredGain = 1.0;
      if (options.normalise_mode === "rms" && inputRms > 0) {
        const targetRmsLinear = dbfsToLinear(options.target_rms_dbfs);
        desiredGain = targetRmsLinear / inputRms;
      } else if (options.normalise_mode === "peak" && inputPeak > 0) {
        const targetPeakLinear = dbfsToLinear(options.target_peak_dbfs);
        desiredGain = targetPeakLinear / inputPeak;
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

    // Stage 2: soft-clip
    const CLIP_THRESHOLD = Math.max(0.5, Math.min(1.0, options.soft_clip_threshold));
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

    ctx.postMessage({ type: "stage", stage: "encoding" });
    const blob = await encodeMp3(channels, sampleRate);
    const sampleModified = softClipped || normalisationApplied;

    const done: DoneMessage = {
      type: "done",
      blob,
      reason: sampleModified ? "applied" : "below_normalise_threshold",
      applied: sampleModified,
      inputChannels,
      measured: {
        input_rms_dbfs: inputRmsDbfs,
        input_peak_dbfs: inputPeakDbfs,
        applied_gain_db: appliedGainDb,
        output_rms_dbfs: outputRmsDbfs,
        output_peak_dbfs: outputPeakDbfs,
        soft_clip_samples_pct: softClipSamplesPct,
        normalise_mode: options.normalise_mode as NormaliseMode,
      },
    };
    ctx.postMessage(done);
  } catch (error) {
    ctx.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Worker enhancement failed",
    });
  }
});
