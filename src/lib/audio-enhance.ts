/**
 * Client-side audio preprocessing using Web Audio API.
 *
 * Normalise-only chain (NO dynamic range compression):
 *   1. Noise gate — skip near-silent recordings
 *   2. Soft-clip limiter (tanh at ±0.95) — safety only
 *   3. Capped peak normalisation (target -1 dBFS, max +12 dB volume boost)
 *
 * Speech dynamics are fully preserved. The peak-normalisation gives quiet
 * recordings a meaningful loudness lift without pumping or over-processing.
 */

/** Compute RMS level of an AudioBuffer across all channels. */
function computeRMS(buffer: AudioBuffer): number {
  let sumSq = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
      count++;
    }
  }
  return Math.sqrt(sumSq / count);
}

/** Encode an AudioBuffer to a WAV Blob (PCM 16-bit). */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  // Interleave channels
  const length = buffer.length * numChannels;
  const samples = new Int16Array(length);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      // Clamp to [-1, 1] then scale to Int16
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  const output = new Int16Array(arrayBuffer, headerSize);
  output.set(samples);

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Normalise + boost an audio file for transcription. NO compression.
 * Returns a new WAV File.
 *
 *   1. Noise gate — if RMS < -50 dBFS, skip and just WAV-encode
 *   2. Soft-clip limiter — tanh at ±0.95 to prevent any digital clipping
 *   3. Peak normalise — target -1 dBFS, capped at +12 dB max gain
 *
 * Speech dynamics are preserved. Pure loudness restoration only.
 */
export async function enhanceAudioForTranscription(
  file: File,
  onProgress?: (stage: "decoding" | "processing" | "encoding") => void
): Promise<File> {
  onProgress?.("decoding");

  const arrayBuffer = await file.arrayBuffer();

  const tempCtx = new AudioContext();
  const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  await tempCtx.close();

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const enhancedFileName = `${baseName}_normalised.wav`;

  // --- Noise gate: skip enhancement for near-silent audio ---
  const NOISE_FLOOR = Math.pow(10, -50 / 20); // -50 dBFS ≈ 0.00316
  const rms = computeRMS(audioBuffer);
  if (rms < NOISE_FLOOR) {
    onProgress?.("encoding");
    const wavBlob = encodeWav(audioBuffer);
    return new File([wavBlob], enhancedFileName, { type: "audio/wav" });
  }

  onProgress?.("processing");

  // Operate directly on the decoded buffer — no compressor, no make-up gain.
  // --- Stage 1: Soft-clip limiter (safety only) ---
  const CLIP_THRESHOLD = 0.95;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > CLIP_THRESHOLD) {
        data[i] = CLIP_THRESHOLD * Math.tanh(data[i] / CLIP_THRESHOLD);
      }
    }
  }

  // --- Stage 2: Capped peak normalisation (volume boost) ---
  const TARGET_PEAK = 0.891; // -1 dBFS
  const MAX_NORM_GAIN = 3.981; // +12 dB cap — meaningful boost for quiet recordings
  let maxSample = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxSample) maxSample = abs;
    }
  }
  if (maxSample > 0 && maxSample < TARGET_PEAK) {
    const gain = Math.min(TARGET_PEAK / maxSample, MAX_NORM_GAIN);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }

  onProgress?.("encoding");

  const wavBlob = encodeWav(audioBuffer);
  return new File([wavBlob], enhancedFileName, { type: "audio/wav" });
}
