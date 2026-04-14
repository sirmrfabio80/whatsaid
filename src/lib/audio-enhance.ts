/**
 * Client-side audio preprocessing using Web Audio API.
 * Applies dynamic range compression to reduce loudness imbalance
 * between a loud near-mic voice and a quiet phone-speaker voice.
 */

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
 * Apply dynamic range compression to an audio file using Web Audio API.
 * Returns a new File object with WAV encoding.
 *
 * Compressor parameters are tuned for speech:
 * - threshold -24dB: only compress louder portions
 * - ratio 12:1: heavy compression to bring quiet voice closer
 * - knee 10dB: smooth transition
 * - attack 3ms: catch speech transients quickly
 * - release 250ms: avoid pumping artifacts
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

  // Dynamics compressor
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, 0);
  compressor.ratio.setValueAtTime(12, 0);
  compressor.knee.setValueAtTime(10, 0);
  compressor.attack.setValueAtTime(0.003, 0);
  compressor.release.setValueAtTime(0.25, 0);

  // Connect: source -> compressor -> destination
  source.connect(compressor);
  compressor.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();

  onProgress?.("encoding");

  const wavBlob = encodeWav(renderedBuffer);

  // Build filename: replace extension with .wav
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const enhancedFileName = `${baseName}_enhanced.wav`;

  return new File([wavBlob], enhancedFileName, { type: "audio/wav" });
}
