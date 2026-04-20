/**
 * Demuxer dispatch by file extension/MIME.
 *
 * Stage 1 supports M4A/MP4 only. MP3 and WAV demuxers will be added in
 * Stage 2; until then, the streaming path is gated on a supported
 * container + WebCodecs availability.
 */

import { Mp4Demuxer } from "./mp4-demuxer";
import type { StreamingDemuxer } from "./types";

export function isStreamingSupported(file: File): boolean {
  if (typeof AudioDecoder === "undefined") return false;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  // Stage 1: M4A/MP4 only.
  if (name.endsWith(".m4a") || name.endsWith(".mp4") || name.endsWith(".m4b") || name.endsWith(".aac")) return true;
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/aac") return true;
  return false;
}

export function createDemuxer(file: File): StreamingDemuxer {
  // Only path implemented in Stage 1.
  return new Mp4Demuxer(file);
}

export type { StreamingDemuxer, DemuxedTrackInfo, EncodedChunkHandler } from "./types";
