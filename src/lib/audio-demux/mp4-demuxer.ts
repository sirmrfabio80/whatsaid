/**
 * Streaming M4A/MP4 audio demuxer powered by mp4box.js.
 *
 * mp4box accepts arbitrary byte ranges fed via `appendBuffer()` and emits
 * decoded `samples` arrays once the moov box has been parsed. We feed the
 * file in 1 MB slices, wait for `onReady` to surface the audio track config,
 * then yield each sample as an `EncodedAudioChunk` for `AudioDecoder`.
 *
 * Codec string mapping (object_type_indication / audio_object_type):
 *   AAC-LC (OTI 0x40, AOT 2)  → "mp4a.40.2"
 *   HE-AAC (AOT 5)            → "mp4a.40.5"
 *   HE-AAC v2 (AOT 29)        → "mp4a.40.29"
 *   ALAC                      → "alac" (rare; not all browsers support it)
 *
 * The codec description (esds payload) is required by `AudioDecoder` for AAC.
 */

import type {
  DemuxedTrackInfo,
  EncodedChunkHandler,
  StreamingDemuxer,
} from "./types";

// mp4box ships an ES module; load it lazily inside the worker so it isn't
// pulled into the main page bundle.
type Mp4BoxFile = ReturnType<typeof loadMp4BoxStub>;
function loadMp4BoxStub(): unknown {
  return null;
}

interface Mp4BoxAudioTrack {
  id: number;
  type: "audio";
  codec: string; // e.g. "mp4a.40.2"
  audio: { sample_rate: number; channel_count: number };
  nb_samples: number;
  timescale: number;
  duration: number;
}

interface Mp4BoxInfo {
  tracks: Array<Mp4BoxAudioTrack | { id: number; type: string }>;
  audioTracks?: Mp4BoxAudioTrack[];
}

interface Mp4BoxSample {
  number: number;
  cts: number;
  dts: number;
  duration: number;
  is_sync: boolean;
  data: Uint8Array;
}

interface Mp4BoxFileApi {
  onReady: (info: Mp4BoxInfo) => void;
  onSamples: (id: number, user: unknown, samples: Mp4BoxSample[]) => void;
  onError: (err: string) => void;
  setExtractionOptions: (
    trackId: number,
    user: unknown,
    options: { nbSamples: number },
  ) => void;
  appendBuffer: (buf: ArrayBuffer & { fileStart: number }) => number;
  start: () => void;
  stop: () => void;
  flush: () => void;
}

interface Mp4BoxModule {
  createFile(): Mp4BoxFileApi;
}

/**
 * Build the AAC esds description bytes from an mp4box track. mp4box exposes
 * the raw esds payload via `track.esds` after the moov is parsed, but the
 * public surface is fragile across versions — we extract the AudioSpecificConfig
 * by walking the track's `mdia.minf.stbl.stsd` boxes through the internal API.
 *
 * Practically, the `EncodedAudioChunk` path doesn't strictly need the full
 * esds for AudioDecoder.configure when we use the canonical "mp4a.40.X" codec
 * string + the AAC AudioSpecificConfig. mp4box exposes that as a Uint8Array
 * on the track via `track.audio.audioSpecificConfig` in v2.x; older versions
 * require manual extraction. We probe both locations.
 */
function extractAacAsc(track: Mp4BoxAudioTrack): Uint8Array | undefined {
  const t = track as unknown as {
    audio?: { audioSpecificConfig?: Uint8Array };
    esds?: { audioSpecificConfig?: Uint8Array };
  };
  return t.audio?.audioSpecificConfig ?? t.esds?.audioSpecificConfig;
}

export class Mp4Demuxer implements StreamingDemuxer {
  readonly ready: Promise<DemuxedTrackInfo>;
  private resolveReady!: (info: DemuxedTrackInfo) => void;
  private rejectReady!: (err: Error) => void;
  private file: File;
  private mp4: Mp4BoxFileApi | null = null;
  private trackId: number | null = null;
  private trackInfo: Mp4BoxAudioTrack | null = null;

  constructor(file: File) {
    this.file = file;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  async run(
    onChunk: EncodedChunkHandler,
    onPressure?: () => Promise<void>,
  ): Promise<void> {
    // Late import: keeps mp4box (~150 KB) out of the worker entry chunk if
    // this demuxer isn't used.
    const mp4boxMod = (await import("mp4box")) as unknown as Mp4BoxModule;
    const mp4 = mp4boxMod.createFile();
    this.mp4 = mp4;

    let pendingChunks: EncodedAudioChunk[] = [];
    let demuxComplete = false;
    let runError: Error | null = null;

    mp4.onError = (err) => {
      runError = new Error(`mp4box: ${err}`);
      this.rejectReady(runError);
    };

    mp4.onReady = (info) => {
      const audio = (info.audioTracks?.[0] ?? info.tracks.find((t) => t.type === "audio")) as
        | Mp4BoxAudioTrack
        | undefined;
      if (!audio) {
        const err = new Error("mp4box: no audio track");
        runError = err;
        this.rejectReady(err);
        return;
      }
      this.trackId = audio.id;
      this.trackInfo = audio;

      const description = extractAacAsc(audio);
      const info0: DemuxedTrackInfo = {
        codec: audio.codec,
        sampleRate: audio.audio.sample_rate,
        numberOfChannels: audio.audio.channel_count,
        description,
        durationSamples: audio.nb_samples * 1024, // AAC frame ≈ 1024 samples; rough
      };
      this.resolveReady(info0);

      mp4.setExtractionOptions(audio.id, null, { nbSamples: 100 });
      mp4.start();
    };

    mp4.onSamples = (_id, _user, samples) => {
      const ti = this.trackInfo;
      if (!ti) return;
      // Convert mp4box timestamps (in the track's timescale) to microseconds
      // as required by EncodedAudioChunk.
      const tscale = ti.timescale;
      for (const s of samples) {
        const timestampUs = Math.round((s.cts / tscale) * 1_000_000);
        const durationUs = Math.round((s.duration / tscale) * 1_000_000);
        const chunk = new EncodedAudioChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: timestampUs,
          duration: durationUs,
          data: s.data,
        });
        pendingChunks.push(chunk);
      }
    };

    // Stream the file into mp4box in 1 MB slices.
    const SLICE = 1 << 20;
    let offset = 0;
    while (offset < this.file.size) {
      if (runError) throw runError;
      const end = Math.min(offset + SLICE, this.file.size);
      const buf = await this.file.slice(offset, end).arrayBuffer();
      // mp4box requires fileStart on the buffer.
      const tagged = buf as ArrayBuffer & { fileStart: number };
      tagged.fileStart = offset;
      mp4.appendBuffer(tagged);
      offset = end;

      // Drain any queued chunks (with optional backpressure).
      if (pendingChunks.length > 0) {
        const drain = pendingChunks;
        pendingChunks = [];
        for (const c of drain) onChunk(c);
        if (onPressure) await onPressure();
      }
    }
    mp4.flush();
    demuxComplete = true;

    // Final drain after flush.
    if (pendingChunks.length > 0) {
      for (const c of pendingChunks) onChunk(c);
      pendingChunks = [];
    }

    if (runError) throw runError;
    if (!demuxComplete) throw new Error("mp4box: demux did not complete");
  }
}
