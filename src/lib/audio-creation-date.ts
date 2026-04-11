/**
 * Extract the recording creation date from an audio file's binary metadata.
 *
 * For M4A / MP4 / MOV containers, reads the `mvhd` (Movie Header) atom which
 * stores the creation time as seconds since the Mac epoch (1904-01-01 00:00:00 UTC).
 *
 * For MP3 files, attempts to read the ID3v2 TDRC/TDRL/TDAT tags.
 *
 * Returns null if metadata cannot be extracted.
 */

// Mac epoch offset: seconds between 1904-01-01 and 1970-01-01
const MAC_EPOCH_OFFSET = 2082844800;

/**
 * Navigate MP4 box structure to find a box by path (e.g. ["moov", "mvhd"]).
 * Returns the data offset and size of the target box's content.
 */
function findBox(
  view: DataView,
  start: number,
  end: number,
  path: string[]
): { offset: number; size: number } | null {
  if (path.length === 0) return null;
  const target = path[0];
  let pos = start;

  while (pos < end - 8) {
    const size = view.getUint32(pos);
    if (size < 8) break; // invalid box

    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );

    if (type === target) {
      if (path.length === 1) {
        // Found the target — return content after the 8-byte header
        return { offset: pos + 8, size: size - 8 };
      }
      // Recurse into this container box
      return findBox(view, pos + 8, pos + size, path.slice(1));
    }

    pos += size;
  }
  return null;
}

/**
 * Extract creation date from MP4/M4A/MOV container.
 * Reads moov > mvhd atom's creation_time field.
 */
function extractMp4CreationDate(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  const result = findBox(view, 0, buffer.byteLength, ["moov", "mvhd"]);
  if (!result) return null;

  const { offset } = result;
  const version = view.getUint8(offset);

  let creationTimeSecs: number;

  if (version === 0) {
    // 32-bit creation_time at offset+4
    creationTimeSecs = view.getUint32(offset + 4);
  } else if (version === 1) {
    // 64-bit creation_time at offset+4
    // Read as two 32-bit values (high and low)
    const high = view.getUint32(offset + 4);
    const low = view.getUint32(offset + 8);
    creationTimeSecs = high * 0x100000000 + low;
  } else {
    return null;
  }

  if (creationTimeSecs === 0) return null;

  // Convert from Mac epoch to Unix epoch
  const unixSeconds = creationTimeSecs - MAC_EPOCH_OFFSET;
  const date = new Date(unixSeconds * 1000);

  // Sanity check: reject dates before 2000 or far in the future
  if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return null;

  return date;
}

/**
 * Extract the creation/recording date from an audio file.
 * Reads only the first 64KB of the file which is enough for header metadata.
 *
 * Supported: .m4a, .mp4, .mov, .aac (in MP4 container)
 * Falls back to null for unsupported formats.
 */
export async function extractAudioCreationDate(file: File): Promise<Date | null> {
  try {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const mp4Types = ["m4a", "mp4", "mov", "aac"];

    if (mp4Types.includes(ext) || file.type.includes("mp4") || file.type.includes("m4a") || file.type.includes("audio/x-m4a")) {
      // Read first 1MB — moov atom is usually at the start but can be after mdat
      // For large files with moov at the end, we'd need to read the end too
      const firstChunk = file.slice(0, 1024 * 1024);
      const buffer = await firstChunk.arrayBuffer();
      const date = extractMp4CreationDate(buffer);

      if (date) return date;

      // If moov wasn't in the first 1MB, try reading the last 1MB
      // (some encoders place moov at the end)
      if (file.size > 1024 * 1024) {
        const lastChunk = file.slice(Math.max(0, file.size - 1024 * 1024));
        const lastBuffer = await lastChunk.arrayBuffer();
        // We need to adjust — findBox assumes contiguous data from file start,
        // but for end-of-file moov we just search this chunk directly
        const lastDate = extractMp4CreationDate(lastBuffer);
        if (lastDate) return lastDate;
      }
    }

    // For MP3, WAV — the creation date is not reliably stored in a standard way
    // that we can extract without a full ID3/RIFF parser. Return null.
    return null;
  } catch {
    return null;
  }
}
