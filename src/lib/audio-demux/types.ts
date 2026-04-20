/**
 * Shared types for streaming audio demuxers.
 *
 * A `StreamingDemuxer` reads an encoded audio file and yields
 * `EncodedAudioChunk`s suitable for `WebCodecs.AudioDecoder`. It also exposes
 * the codec config needed to construct that decoder.
 *
 * Used by the audio-enhance worker to decode arbitrarily long files in
 * constant memory.
 */

export interface DemuxedTrackInfo {
  /** Codec string for AudioDecoder.configure (e.g. "mp4a.40.2", "mp3", "pcm-s16"). */
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  /** AAC/Opus codec-specific config bytes (esds for AAC). */
  description?: Uint8Array;
  /** Total samples in the track if known up-front (used for progress only). */
  durationSamples?: number;
}

export type EncodedChunkHandler = (chunk: EncodedAudioChunk) => void;

export interface StreamingDemuxer {
  /** Resolves once the track config has been parsed (after enough bytes are read). */
  readonly ready: Promise<DemuxedTrackInfo>;
  /**
   * Begin reading the file and emitting `EncodedAudioChunk`s via `onChunk`.
   * Resolves when the entire file has been demuxed.
   *
   * Implementations should respect backpressure by awaiting the optional
   * `onPressure()` callback between batches.
   */
  run(
    onChunk: EncodedChunkHandler,
    onPressure?: () => Promise<void>,
  ): Promise<void>;
}
