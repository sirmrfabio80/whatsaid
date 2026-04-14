/**
 * Client-side audio preprocessing using Web Audio API.
 *
 * Speech-oriented enhancement chain:
 *   1. Noise gate — skip near-silent recordings
 *   2. Gentle dynamic range compression (4:1)
 *   3. Make-up gain (+6 dB)
 *   4. Soft-clip limiter (tanh at ±0.95)
 *   5. Capped peak normalisation (target -1 dBFS, max +9 dB)
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
 * Apply a speech-oriented enhancement chain to an audio file.
 * Returns a new File object with WAV encoding.
 *
 * Chain:
 *   1. Noise gate — if RMS < -50 dBFS, skip enhancement (WAV-encode only)
 *   2. Compressor — gentle 4:1 for speech intelligibility
 *   3. Make-up gain — +6 dB to recover loudness after compression
 *   4. Soft-clip limiter — tanh saturation at ±0.95 to prevent clipping
 *   5. Peak normalise — target -1 dBFS, capped at +9 dB max gain
 */
export async function enhanceAudioForTranscription(
  file: File,
  onProgress?: (stage: "decoding" | "processing" | "encoding") => void
): Promise<File> {
  onProgress?.("decoding");

  const arrayBuffer = await file.arrayBuffer();

  // Use a temporary AudioContext just for decoding
  const tempCtx = new AudioContext();
  const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  await tempCtx.close();

  // Build output filename early (used in both paths)
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const enhancedFileName = `${baseName}_enhanced.wav`;

  // --- Noise gate: skip enhancement for near-silent audio ---
  const NOISE_FLOOR = Math.pow(10, -50 / 20); // -50 dBFS ≈ 0.00316
  const rms = computeRMS(audioBuffer);
  if (rms < NOISE_FLOOR) {
    onProgress?.("encoding");
    const wavBlob = encodeWav(audioBuffer);
    return new File([wavBlob], enhancedFileName, { type: "audio/wav" });
  }

  onProgress?.("processing");

  // Create offline context matching the source
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  // Source node
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  // --- Stage 1: Gentle dynamic range compression for speech ---
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-30, 0);
  compressor.ratio.setValueAtTime(4, 0);
  compressor.knee.setValueAtTime(12, 0);
  compressor.attack.setValueAtTime(0.005, 0);
  compressor.release.setValueAtTime(0.15, 0);

  // --- Stage 2: Make-up gain (+6 dB) ---
  const makeupGain = offlineCtx.createGain();
  makeupGain.gain.setValueAtTime(2.0, 0); // +6 dB ≈ 10^(6/20) ≈ 1.995

  // Connect: source → compressor → makeupGain → destination
  source.connect(compressor);
  compressor.connect(makeupGain);
  makeupGain.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();

  // --- Stage 3: Soft-clip limiter (post-render, in-place) ---
  const CLIP_THRESHOLD = 0.95;
  for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
    const data = renderedBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > CLIP_THRESHOLD) {
        data[i] = CLIP_THRESHOLD * Math.tanh(data[i] / CLIP_THRESHOLD);
      }
    }
  }

  // --- Stage 4: Capped peak normalisation (safeguard only) ---
  const TARGET_PEAK = 0.891; // -1 dBFS
  const MAX_NORM_GAIN = 2.818; // ~+9 dB cap — never boost more than this
  let maxSample = 0;
  for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
    const data = renderedBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxSample) maxSample = abs;
    }
  }
  if (maxSample > 0 && maxSample < TARGET_PEAK) {
    const gain = Math.min(TARGET_PEAK / maxSample, MAX_NORM_GAIN);
    for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
      const data = renderedBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }

  onProgress?.("encoding");

  const wavBlob = encodeWav(renderedBuffer);
  return new File([wavBlob], enhancedFileName, { type: "audio/wav" });
}
