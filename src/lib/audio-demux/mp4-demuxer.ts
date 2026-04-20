/**
 * Streaming M4A/MP4 audio demuxer powered by mp4box.js.
 *
 * mp4box accepts byte ranges fed via `appendBuffer()` and emits parsed samples
 * once the moov box is available. We feed the file in 1 MB slices, wait for
 * `onReady` to surface the audio track + AAC AudioSpecificConfig, then yield
 * each sample as an `EncodedAudioChunk` for `WebCodecs.AudioDecoder`.
 *
 * Codec mapping (object_type_indication → WebCodecs codec string):
 *   AAC-LC  (AOT 2)  → "mp4a.40.2"
 *   HE-AAC  (AOT 5)  → "mp4a.40.5"
 *   HE-AAC v2 (AOT 29) → "mp4a.40.29"
 *
 * `AudioDecoder.configure({ description })` requires the AAC AudioSpecificConfig
 * (the DecoderSpecificInfo payload inside the esds box). We extract it by
 * walking the ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo.
 */

import type {
  DemuxedTrackInfo,
  EncodedChunkHandler,
  StreamingDemuxer,
} from "./types";

// Loaded lazily so mp4box (~150 KB) only enters the bundle when the worker
// actually demuxes an MP4.
type Mp4BoxModule = typeof import("mp4box");

interface DescriptorLike {
  tag: number;
  data: Uint8Array;
  findDescriptor?: (tag: number) => DescriptorLike | undefined;
  // ES_Descriptor children include nested descriptors. mp4box's parser stores
  // them on internal arrays whose names vary by version — we try the common ones.
  descs?: DescriptorLike[];
  esd_descs?: DescriptorLike[];
}

interface EsdsBoxLike {
  esd: DescriptorLike;
}

interface Mp4aSampleEntryLike {
  type: string;
  esds?: EsdsBoxLike;
}

/**
 * Walk a descriptor tree looking for the DecoderSpecificInfo (tag 0x05),
 * whose payload is the AAC AudioSpecificConfig that AudioDecoder needs.
 */
function findDecoderSpecificInfo(root: DescriptorLike): Uint8Array | undefined {
  // Direct lookup helper if available.
  if (typeof root.findDescriptor === "function") {
    const found = root.findDescriptor(0x05);
    if (found?.data) return found.data;
  }
  // Otherwise walk children breadth-first.
  const queue: DescriptorLike[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.tag === 0x05 && node.data) return node.data;
    const kids = node.descs ?? node.esd_descs ?? [];
    for (const k of kids) queue.push(k);
  }
  return undefined;
}

export class Mp4Demuxer implements StreamingDemuxer {
  readonly ready: Promise<DemuxedTrackInfo>;
  private resolveReady!: (info: DemuxedTrackInfo) => void;
  private rejectReady!: (err: Error) => void;
  private file: File;

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
    const mp4boxMod = (await import("mp4box")) as Mp4BoxModule;
    const mp4 = mp4boxMod.createFile();

    let pendingChunks: EncodedAudioChunk[] = [];
    let runError: Error | null = null;
    let trackInfo: { id: number; timescale: number } | null = null;

    mp4.onError = (err: string) => {
      runError = new Error(`mp4box: ${err}`);
      this.rejectReady(runError);
    };

    mp4.onReady = (info) => {
      // Find the first audio track. mp4box's `Movie.tracks` is a flat list;
      // each track may have a `type` of "audio".
      const audio = info.tracks.find((t) => t.type === "audio");
      if (!audio || !audio.audio) {
        const err = new Error("mp4box: no audio track");
        runError = err;
        this.rejectReady(err);
        return;
      }

      // Pull the AAC AudioSpecificConfig out of the trak's stsd box.
      let description: Uint8Array | undefined;
      try {
        const trak = mp4.getTrackById(audio.id);
        // trak.mdia.minf.stbl.stsd.entries[0] is the SampleEntry (mp4a for AAC).
        const stsdEntries =
          (trak as unknown as {
            mdia: { minf: { stbl: { stsd: { entries: Mp4aSampleEntryLike[] } } } };
          }).mdia.minf.stbl.stsd.entries;
        const entry = stsdEntries.find((e) => e.type === "mp4a") ?? stsdEntries[0];
        if (entry?.esds?.esd) {
          description = findDecoderSpecificInfo(entry.esds.esd);
        }
      } catch (e) {
        console.warn("[mp4-demuxer] failed to extract AAC ASC:", e);
      }

      trackInfo = { id: audio.id, timescale: audio.timescale };
      this.resolveReady({
        codec: audio.codec,
        sampleRate: audio.audio.sample_rate,
        numberOfChannels: audio.audio.channel_count,
        description,
        durationSamples: audio.nb_samples * 1024,
      });

      mp4.setExtractionOptions(audio.id, null, { nbSamples: 100 });
      mp4.start();
    };

    mp4.onSamples = (_id, _user, samples) => {
      const ti = trackInfo;
      if (!ti) return;
      const tscale = ti.timescale;
      for (const s of samples) {
        if (!s.data) continue;
        const timestampUs = Math.round((s.cts / tscale) * 1_000_000);
        const durationUs = Math.round((s.duration / tscale) * 1_000_000);
        pendingChunks.push(
          new EncodedAudioChunk({
            type: s.is_sync ? "key" : "delta",
            timestamp: timestampUs,
            duration: durationUs,
            data: s.data,
          }),
        );
      }
    };

    // Stream the file into mp4box in 1 MB slices.
    const SLICE = 1 << 20;
    let offset = 0;
    while (offset < this.file.size) {
      if (runError) throw runError;
      const end = Math.min(offset + SLICE, this.file.size);
      const buf = await this.file.slice(offset, end).arrayBuffer();
      const tagged = buf as ArrayBuffer & { fileStart: number };
      tagged.fileStart = offset;
      // mp4box's appendBuffer signature accepts an MP4BoxBuffer (ArrayBuffer
      // with `fileStart`). Cast through unknown to satisfy strict typing.
      mp4.appendBuffer(tagged as unknown as Parameters<typeof mp4.appendBuffer>[0]);
      offset = end;

      if (pendingChunks.length > 0) {
        const drain = pendingChunks;
        pendingChunks = [];
        for (const c of drain) onChunk(c);
        if (onPressure) await onPressure();
      }
    }
    mp4.flush();

    if (pendingChunks.length > 0) {
      for (const c of pendingChunks) onChunk(c);
      pendingChunks = [];
    }

    if (runError) throw runError;
  }
}
