/**
 * Detect the number of audio channels from file headers.
 *
 * Uses lightweight header parsing only — no full file decoding.
 * Returns null on failure (caller should treat as mono / unknown).
 *
 * Limitations:
 * - Mono same-mic multi-speaker audio remains best-effort for diarization.
 * - Multichannel routing helps only when channels contain actually separated audio.
 * - Stereo files with identical/mixed channels may produce duplicate output under multichannel mode.
 */

/**
 * Read a small slice of a File as an ArrayBuffer.
 */
function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  const blob = file.slice(start, end);
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read slice"));
    reader.readAsArrayBuffer(blob);
  });
}

// ── WAV ──────────────────────────────────────────────────────────────────────
// Standard WAV header: bytes 0-3 = "RIFF", 8-11 = "WAVE", 22-23 = numChannels (uint16 LE)

function detectWavChannels(header: ArrayBuffer): number | null {
  if (header.byteLength < 24) return null;
  const view = new DataView(header);
  const riff =
    view.getUint8(0) === 0x52 && // R
    view.getUint8(1) === 0x49 && // I
    view.getUint8(2) === 0x46 && // F
    view.getUint8(3) === 0x46;   // F
  const wave =
    view.getUint8(8) === 0x57 &&  // W
    view.getUint8(9) === 0x41 &&  // A
    view.getUint8(10) === 0x56 && // V
    view.getUint8(11) === 0x45;   // E
  if (!riff || !wave) return null;
  return view.getUint16(22, true); // little-endian
}

// ── MP3 ──────────────────────────────────────────────────────────────────────
// MPEG frame header sync: 11 bits set. Byte 3 bits 6-7 encode channel mode:
// 00 = Stereo, 01 = Joint stereo, 10 = Dual channel, 11 = Mono

function detectMp3Channels(header: ArrayBuffer): number | null {
  const view = new DataView(header);
  let offset = 0;

  // Skip ID3v2 tag if present
  if (
    header.byteLength >= 10 &&
    view.getUint8(0) === 0x49 && // I
    view.getUint8(1) === 0x44 && // D
    view.getUint8(2) === 0x33    // 3
  ) {
    // ID3v2 size is stored as synchsafe integer in bytes 6-9
    const b6 = view.getUint8(6);
    const b7 = view.getUint8(7);
    const b8 = view.getUint8(8);
    const b9 = view.getUint8(9);
    const tagSize = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
    offset = 10 + tagSize;
  }

  // Search for frame sync within available bytes
  const searchEnd = Math.min(header.byteLength - 4, offset + 2048);
  for (let i = offset; i < searchEnd; i++) {
    if (view.getUint8(i) === 0xff && (view.getUint8(i + 1) & 0xe0) === 0xe0) {
      const channelMode = (view.getUint8(i + 3) >> 6) & 0x03;
      return channelMode === 3 ? 1 : 2; // 3 = mono, everything else = stereo variant
    }
  }
  return null;
}

// ── M4A / MP4 ────────────────────────────────────────────────────────────────
// Navigate: moov > trak > mdia > minf > stbl > stsd
// Audio sample entry has channel count as uint16 at offset +20 from entry start
// (after 6 reserved bytes + 2 data-ref-index + 8 reserved + 2 channelcount)

function findBoxInView(
  view: DataView,
  start: number,
  end: number,
  boxType: string
): { offset: number; size: number } | null {
  let pos = start;
  while (pos <= end - 8) {
    let size = view.getUint32(pos);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      const high = view.getUint32(pos + 8);
      const low = view.getUint32(pos + 12);
      size = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;

    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );

    if (type === boxType) {
      return { offset: pos + headerSize, size: size - headerSize };
    }
    pos += size;
  }
  return null;
}

function detectM4aChannels(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  const len = buffer.byteLength;

  // Navigate: moov > trak > mdia > minf > stbl > stsd
  const moov = findBoxInView(view, 0, len, "moov");
  if (!moov) return null;

  const trak = findBoxInView(view, moov.offset, moov.offset + moov.size, "trak");
  if (!trak) return null;

  const mdia = findBoxInView(view, trak.offset, trak.offset + trak.size, "mdia");
  if (!mdia) return null;

  const minf = findBoxInView(view, mdia.offset, mdia.offset + mdia.size, "minf");
  if (!minf) return null;

  const stbl = findBoxInView(view, minf.offset, minf.offset + minf.size, "stbl");
  if (!stbl) return null;

  const stsd = findBoxInView(view, stbl.offset, stbl.offset + stbl.size, "stsd");
  if (!stsd) return null;

  // stsd has: version (1) + flags (3) + entry_count (4) = 8 bytes before first entry
  const entryStart = stsd.offset + 8;
  // Audio sample entry layout (after box header which findBoxInView already skipped):
  // 6 reserved bytes + 2 data_ref_index + 8 reserved + 2 channel_count
  // Channel count is at offset +20 from the entry's content start
  // But the entry itself is a box: 4 size + 4 type + content
  // So channel count is at entryStart + 8 (box header) + 6 + 2 + 8 = entryStart + 24
  const channelOffset = entryStart + 8 + 6 + 2 + 8;
  if (channelOffset + 2 > stsd.offset + stsd.size) return null;

  const channels = view.getUint16(channelOffset);
  if (channels < 1 || channels > 64) return null; // sanity check
  return channels;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect the number of audio channels from file headers.
 *
 * - WAV: reads first 44 bytes
 * - MP3: reads first 4KB (to skip ID3v2 tag and find frame header)
 * - M4A/MP4: reads full file (reused for metadata extraction anyway)
 *
 * Returns null if detection fails — caller should treat as mono (safe default).
 */
export async function detectChannelCount(file: File): Promise<number | null> {
  try {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    // WAV — only need 44 bytes
    if (ext === "wav" || file.type === "audio/wav" || file.type === "audio/x-wav") {
      const header = await readSlice(file, 0, 44);
      const result = detectWavChannels(header);
      console.log("[audio-channels] WAV detected channels:", result);
      return result;
    }

    // MP3 — need up to 4KB to skip ID3v2 and find frame sync
    if (ext === "mp3" || file.type === "audio/mpeg" || file.type === "audio/mp3") {
      // ID3v2 tags can be large; read enough to get the tag size, then the frame header
      const preHeader = await readSlice(file, 0, 10);
      const preView = new DataView(preHeader);
      let readSize = 4096;

      if (
        preView.getUint8(0) === 0x49 && // I
        preView.getUint8(1) === 0x44 && // D
        preView.getUint8(2) === 0x33    // 3
      ) {
        const b6 = preView.getUint8(6);
        const b7 = preView.getUint8(7);
        const b8 = preView.getUint8(8);
        const b9 = preView.getUint8(9);
        const tagSize = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
        readSize = 10 + tagSize + 4; // tag + first frame header
      }

      const header = await readSlice(file, 0, Math.min(readSize, file.size));
      const result = detectMp3Channels(header);
      console.log("[audio-channels] MP3 detected channels:", result);
      return result;
    }

    // M4A / MP4 — full file buffer (already loaded for creation-date extraction)
    const mp4Types = ["m4a", "mp4", "mov", "aac"];
    if (mp4Types.includes(ext) || file.type.includes("mp4") || file.type.includes("m4a") || file.type.includes("audio/x-m4a")) {
      const buffer = await file.arrayBuffer();
      const result = detectM4aChannels(buffer);
      console.log("[audio-channels] M4A/MP4 detected channels:", result);
      return result;
    }

    console.log("[audio-channels] Unknown format, returning null");
    return null;
  } catch (error) {
    console.warn("[audio-channels] Detection failed:", error);
    return null;
  }
}
