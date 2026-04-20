/**
 * Streaming enhance pipeline: read the file, demux + decode it in chunks
 * via WebCodecs, never hold the full PCM in memory.
 *
 * Two passes are required because the gain decision depends on the full input
 * RMS/peak. We trade one extra decode-only walk for accurate, deterministic
 * loudness behaviour identical to the in-memory path.
 *
 *   Pass 1 (measure)
 *     demuxer → AudioDecoder → for each AudioData frame:
 *       sumSq += Σx², peak = max(|x|)        ← O(1) memory
 *
 *   Pass 2 (encode)
 *     demuxer → AudioDecoder → for each AudioData frame:
 *       multiply by computed gain (in scratch buffer)
 *       soft-clip (tanh)
 *       feed Int16 frames to lamejs.Mp3Encoder
 *       postMessage MP3 chunks back as they accumulate (~64 KB each)
 *
 * Memory stays constant regardless of file length: we hold a few
 * AudioData frames (decoder queue ≤ 8) + small Int16 scratch + < 64 KB of
 * pending MP3 bytes before each flush. Encoded MP3 is transferred to the
 * main thread immediately so the worker heap doesn't grow with output size.
 */

import { Mp3Encoder } from "@breezystack/lamejs";
import type {
  AudioEnhanceOptions,
  AudioEnhanceMeasured,
  NormaliseMode,
} from "./audio-enhance";
import type { EnhanceStreamingRequest, EnhanceWorkerDone } from "./audio-enhance.worker";
import { createDemuxer } from "./audio-demux";
import type { DemuxedTrackInfo, StreamingDemuxer } from "./audio-demux/types";
import { postStreamingDone } from "./audio-enhance.worker";

// ---- helpers (duplicated from worker.ts for module isolation) -------------

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

// ---- shared decoding plumbing ---------------------------------------------

/**
 * Build + configure an AudioDecoder for the given track. Surfaces the actual
 * `sampleRate` / `numberOfChannels` from the first AudioData (HE-AAC SBR
 * sometimes doubles the rate vs. the codec config).
 */
async function buildDecoder(
  info: DemuxedTrackInfo,
  onFrame: (frame: AudioData) => void,
  onError: (err: Error) => void,
): Promise<AudioDecoder> {
  const config: AudioDecoderConfig = {
    codec: info.codec,
    sampleRate: info.sampleRate,
    numberOfChannels: info.numberOfChannels,
  };
  if (info.description) config.description = info.description;

  const supported = await AudioDecoder.isConfigSupported(config);
  if (!supported.supported) {
    throw new Error(`audio_decoder_unsupported_codec:${info.codec}`);
  }

  const decoder = new AudioDecoder({
    output: onFrame,
    error: (e) => onError(e instanceof Error ? e : new Error(String(e))),
  });
  decoder.configure(config);
  return decoder;
}

/**
 * Drive a demuxer→decoder pipeline, calling `onFrame` for every decoded
 * AudioData. Caller MUST close each frame after consuming it.
 *
 * Returns the actual sample rate + channel count observed at the decoder
 * output, since HE-AAC's reported sample rate can change after the first
 * decode call.
 */
async function runDecodePass(
  file: File,
  onFrame: (frame: AudioData) => void,
): Promise<{
  sampleRate: number;
  numberOfChannels: number;
  totalSamples: number;
}> {
  const demuxer: StreamingDemuxer = createDemuxer(file);

  let observedSampleRate = 0;
  let observedChannels = 0;
  let totalSamples = 0;
  let runError: Error | null = null;

  const wrappedOnFrame = (frame: AudioData) => {
    if (observedSampleRate === 0) {
      observedSampleRate = frame.sampleRate;
      observedChannels = frame.numberOfChannels;
    }
    totalSamples += frame.numberOfFrames;
    onFrame(frame);
  };

  const handleErr = (err: Error) => {
    if (!runError) runError = err;
  };

  const info = await demuxer.ready;
  const decoder = await buildDecoder(info, wrappedOnFrame, handleErr);

  await demuxer.run(
    (chunk) => {
      if (runError) return;
      decoder.decode(chunk);
    },
    async () => {
      // Backpressure: pause if too many decode operations are queued.
      while (decoder.decodeQueueSize > 8 && !runError) {
        await new Promise<void>((r) => setTimeout(r, 4));
      }
    },
  );

  if (runError) {
    decoder.close();
    throw runError;
  }

  await decoder.flush();
  decoder.close();
  if (runError) throw runError;

  return {
    sampleRate: observedSampleRate || info.sampleRate,
    numberOfChannels: observedChannels || info.numberOfChannels,
    totalSamples,
  };
}

/**
 * Read planar Float32 samples for one channel out of an AudioData frame
 * into the provided scratch buffer. AudioData.copyTo handles both planar
 * and interleaved internal layouts when format is "f32-planar" / "f32".
 */
function readChannelToScratch(frame: AudioData, channelIdx: number, scratch: Float32Array) {
  const needed = frame.numberOfFrames;
  if (scratch.length < needed) {
    throw new Error(`scratch buffer too small (${scratch.length} < ${needed})`);
  }
  // Prefer planar f32 when available; fall back to interleaved.
  const fmt = frame.format;
  if (fmt === "f32-planar") {
    frame.copyTo(scratch.subarray(0, needed), { planeIndex: channelIdx, format: "f32-planar" });
  } else if (fmt === "f32") {
    // Interleaved: copy whole frame into a temp and de-interleave.
    const tmp = new Float32Array(needed * frame.numberOfChannels);
    frame.copyTo(tmp, { planeIndex: 0, format: "f32" });
    for (let i = 0; i < needed; i++) {
      scratch[i] = tmp[i * frame.numberOfChannels + channelIdx];
    }
  } else {
    // Browser returned something else (s16, etc.) — request planar f32.
    frame.copyTo(scratch.subarray(0, needed), { planeIndex: channelIdx, format: "f32-planar" });
  }
}

// ---- entry point called from worker.ts ------------------------------------

export async function handleStreamingEnhance(
  msg: EnhanceStreamingRequest,
  bitrateKbps: number,
  postChunk: (bytes: Uint8Array, byteOffset: number) => void,
): Promise<void> {
  const { file, options: opts } = msg;

  // Scratch grows on demand to fit the largest frame seen so far.
  let scratchL = new Float32Array(8192);
  let scratchR = new Float32Array(8192);
  const ensureScratch = (needed: number) => {
    if (scratchL.length < needed) scratchL = new Float32Array(needed);
    if (scratchR.length < needed) scratchR = new Float32Array(needed);
  };

  // -------- PASS 1: measure RMS + peak --------
  let sumSq = 0;
  let sampleCount = 0;
  let inputPeak = 0;

  const pass1 = await runDecodePass(file, (frame) => {
    try {
      const ch = frame.numberOfChannels;
      const n = frame.numberOfFrames;
      ensureScratch(n);
      for (let c = 0; c < Math.min(ch, 2); c++) {
        const buf = c === 0 ? scratchL : scratchR;
        readChannelToScratch(frame, c, buf);
        for (let i = 0; i < n; i++) {
          const x = buf[i];
          sumSq += x * x;
          const ax = x < 0 ? -x : x;
          if (ax > inputPeak) inputPeak = ax;
        }
        sampleCount += n;
      }
    } finally {
      frame.close();
    }
  });

  const inputChannels: 1 | 2 = pass1.numberOfChannels === 1 ? 1 : 2;
  const inputRms = sampleCount > 0 ? Math.sqrt(sumSq / sampleCount) : 0;
  const inputRmsDbfs = linearToDbfs(inputRms);
  const inputPeakDbfs = linearToDbfs(inputPeak);

  const NOISE_FLOOR = dbfsToLinear(opts.noise_floor_dbfs);
  const noiseGated = inputRms < NOISE_FLOOR;

  // Compute gain.
  const maxGainDb = inputChannels === 1 ? opts.max_gain_db_mono : opts.max_gain_db_stereo;
  const MAX_NORM_GAIN = dbfsToLinear(maxGainDb);

  let gain = 1.0;
  let normalisationApplied = false;
  if (!noiseGated && opts.normalise) {
    let desiredGain = 1.0;
    if (opts.normalise_mode === "rms" && inputRms > 0) {
      desiredGain = dbfsToLinear(opts.target_rms_dbfs) / inputRms;
    } else if (opts.normalise_mode === "peak" && inputPeak > 0) {
      desiredGain = dbfsToLinear(opts.target_peak_dbfs) / inputPeak;
    }
    gain = Math.max(1.0, Math.min(desiredGain, MAX_NORM_GAIN));
    normalisationApplied = gain > 1.0;
  }
  const appliedGainDb = linearToDbfs(gain);

  // -------- PASS 2: apply gain → soft-clip → encode → stream --------
  const CLIP_THRESHOLD = Math.max(0.5, Math.min(1.0, opts.soft_clip_threshold));

  // MP3 encoder is created after we know the actual sample rate from pass 1.
  const numChannelsOut: 1 | 2 = inputChannels;
  const encoder = new Mp3Encoder(numChannelsOut, pass1.sampleRate, bitrateKbps);

  // Reusable Int16 scratch for the encoder. Sized for the largest expected
  // frame; grown on demand if the decoder produces bigger ones.
  let int16L = new Int16Array(8192);
  let int16R = new Int16Array(8192);
  const ensureInt16 = (n: number) => {
    if (int16L.length < n) int16L = new Int16Array(n);
    if (int16R.length < n) int16R = new Int16Array(n);
  };

  // Accumulate MP3 output and flush in ~64 KB postMessage payloads.
  const FLUSH_BYTES = 64 * 1024;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let totalBytes = 0;
  let softClipSampleCount = 0;
  let postGainSumSq = 0;
  let postGainSampleCount = 0;
  let outputPeak = 0;

  const flushPending = () => {
    if (pendingBytes === 0) return;
    const merged = new Uint8Array(pendingBytes);
    let off = 0;
    for (const c of pending) {
      merged.set(c, off);
      off += c.length;
    }
    const startOffset = totalBytes;
    totalBytes += merged.length;
    postChunk(merged, startOffset);
    pending = [];
    pendingBytes = 0;
  };

  const enqueueMp3 = (bytes: Uint8Array) => {
    if (bytes.length === 0) return;
    pending.push(new Uint8Array(bytes));
    pendingBytes += bytes.length;
    if (pendingBytes >= FLUSH_BYTES) flushPending();
  };

  await runDecodePass(file, (frame) => {
    try {
      const n = frame.numberOfFrames;
      ensureScratch(n);
      ensureInt16(n);
      const ch = Math.min(frame.numberOfChannels, 2);

      // Read both channels into Float32 scratch.
      for (let c = 0; c < ch; c++) {
        readChannelToScratch(frame, c, c === 0 ? scratchL : scratchR);
      }
      // If decoder gave mono but we're treating as mono, reuse scratchL.
      // If stereo, both already filled.

      // Apply gain + soft-clip + measure → write Int16.
      for (let c = 0; c < numChannelsOut; c++) {
        const inBuf = c === 0 ? scratchL : (ch === 2 ? scratchR : scratchL);
        const outBuf = c === 0 ? int16L : int16R;
        for (let i = 0; i < n; i++) {
          let s = inBuf[i] * gain;
          const abs = s < 0 ? -s : s;
          if (abs > CLIP_THRESHOLD) {
            s = CLIP_THRESHOLD * Math.tanh(s / CLIP_THRESHOLD);
            softClipSampleCount++;
          }
          // Track post-gain stats.
          postGainSumSq += s * s;
          postGainSampleCount++;
          const finalAbs = s < 0 ? -s : s;
          if (finalAbs > outputPeak) outputPeak = finalAbs;
          outBuf[i] = floatToInt16(s);
        }
      }

      // Encode in MP3-frame-sized slices (1152 samples per MP3 frame).
      const FRAME = 1152;
      for (let off = 0; off < n; off += FRAME) {
        const end = Math.min(off + FRAME, n);
        const lView = int16L.subarray(off, end);
        const rView = numChannelsOut === 2 ? int16R.subarray(off, end) : null;
        const mp3buf = rView
          ? encoder.encodeBuffer(lView, rView)
          : encoder.encodeBuffer(lView);
        if (mp3buf.length > 0) enqueueMp3(mp3buf);
      }
    } finally {
      frame.close();
    }
  });

  const tail = encoder.flush();
  if (tail.length > 0) enqueueMp3(tail);
  flushPending();

  const postGainRms = postGainSampleCount > 0
    ? Math.sqrt(postGainSumSq / postGainSampleCount)
    : 0;
  const outputRmsDbfs = linearToDbfs(postGainRms);
  const outputPeakDbfs = linearToDbfs(outputPeak);
  const totalSampleCount = postGainSampleCount;
  const softClipSamplesPct = totalSampleCount > 0
    ? (softClipSampleCount / totalSampleCount) * 100
    : 0;
  const softClipped = softClipSampleCount > 0;

  const measured: AudioEnhanceMeasured = {
    input_rms_dbfs: inputRmsDbfs,
    input_peak_dbfs: inputPeakDbfs,
    applied_gain_db: appliedGainDb,
    output_rms_dbfs: outputRmsDbfs,
    output_peak_dbfs: outputPeakDbfs,
    soft_clip_samples_pct: softClipSamplesPct,
    normalise_mode: opts.normalise_mode as NormaliseMode,
  };

  const sampleModified = softClipped || normalisationApplied;
  const reason: EnhanceWorkerDone["reason"] = noiseGated
    ? "noise_gated"
    : (sampleModified ? "applied" : "below_normalise_threshold");

  const done: EnhanceWorkerDone = {
    type: "done",
    measured,
    normalisationApplied,
    softClipped,
    reason,
    totalBytes,
  };
  postStreamingDone(done);
}

// Re-export for convenience.
export type { AudioEnhanceOptions };
