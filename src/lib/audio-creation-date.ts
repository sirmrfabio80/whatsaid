/**
 * Extract the recording creation date from an audio file's binary metadata.
 *
 * Priority:
 * 1. com.apple.quicktime.creationdate from keys/ilst metadata (ISO 8601 with timezone)
 * 2. mvhd creation_time (Mac epoch, UTC)
 * 3. null (caller falls back to file.lastModified)
 */

const MAC_EPOCH_OFFSET = 2082844800;

/**
 * Navigate MP4 box structure to find a box by path.
 * `skipBytes` allows skipping version/flags headers (e.g. 4 bytes for `meta` atom).
 */
function findBox(
  view: DataView,
  start: number,
  end: number,
  path: string[],
  skipBytesForContainer?: number[]
): { offset: number; size: number } | null {
  if (path.length === 0) return null;
  const target = path[0];
  let pos = start;

  while (pos < end - 8) {
    const size = view.getUint32(pos);
    if (size < 8) break;

    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7)
    );

    if (type === target) {
      if (path.length === 1) {
        return { offset: pos + 8, size: size - 8 };
      }
      const skip = skipBytesForContainer?.[0] ?? 0;
      return findBox(
        view,
        pos + 8 + skip,
        pos + size,
        path.slice(1),
        skipBytesForContainer?.slice(1)
      );
    }

    pos += size;
  }
  return null;
}

/** Read a UTF-8 string from a DataView range. */
function readString(view: DataView, offset: number, length: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(view.getUint8(offset + i));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

/**
 * Extract com.apple.quicktime.creationdate from moov > udta > meta > keys/ilst.
 */
function extractAppleCreationDate(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  // Find moov > udta > meta (meta has a 4-byte version/flags header)
  const metaBox = findBox(view, 0, byteLength, ["moov", "udta", "meta"], [0, 0, 4]);
  if (!metaBox) return null;

  // The meta content starts after the 4-byte version header
  const metaStart = metaBox.offset;
  const metaEnd = metaBox.offset + metaBox.size;

  // Find keys atom within meta
  const keysBox = findBox(view, metaStart, metaEnd, ["keys"]);
  if (!keysBox) return null;

  // Parse keys: 4 bytes version/flags, 4 bytes entry count, then entries
  const keysDataStart = keysBox.offset;
  const keyCount = view.getUint32(keysDataStart + 4);

  let targetKeyIndex = -1;
  let keyPos = keysDataStart + 8;

  for (let i = 0; i < keyCount; i++) {
    if (keyPos + 8 > keysBox.offset + keysBox.size) break;
    const keySize = view.getUint32(keyPos);
    // key namespace is 4 bytes at keyPos+4, key value starts at keyPos+8
    const keyValueLength = keySize - 8;
    if (keyValueLength > 0 && keyPos + 8 + keyValueLength <= keysBox.offset + keysBox.size) {
      const keyName = readString(view, keyPos + 8, keyValueLength);
      if (keyName === "com.apple.quicktime.creationdate") {
        targetKeyIndex = i + 1; // 1-based index
        break;
      }
    }
    keyPos += keySize;
  }

  if (targetKeyIndex < 0) return null;

  // Find ilst atom within meta
  const ilstBox = findBox(view, metaStart, metaEnd, ["ilst"]);
  if (!ilstBox) return null;

  // ilst contains child boxes keyed by index (big-endian uint32).
  // Each child box type is the 1-based index as a 4-byte big-endian number.
  let ilstPos = ilstBox.offset;
  const ilstEnd = ilstBox.offset + ilstBox.size;

  while (ilstPos < ilstEnd - 8) {
    const itemSize = view.getUint32(ilstPos);
    if (itemSize < 8) break;

    const itemIndex = view.getUint32(ilstPos + 4);

    if (itemIndex === targetKeyIndex) {
      // Inside this item, find the "data" sub-box
      const dataBox = findBox(view, ilstPos + 8, ilstPos + itemSize, ["data"]);
      if (!dataBox) break;

      // data box: 4 bytes type indicator, 4 bytes locale, then the value
      const valueOffset = dataBox.offset + 8;
      const valueLength = dataBox.size - 8;
      if (valueLength <= 0) break;

      const isoString = readString(view, valueOffset, valueLength).trim();
      console.log("[audio-creation-date] Raw Apple creationdate:", isoString);

      const date = new Date(isoString);
      if (isNaN(date.getTime())) return null;

      console.log("[audio-creation-date] Parsed Date:", date.toISOString(), "| Local:", date.toString());

      if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return null;
      return date;
    }

    ilstPos += itemSize;
  }

  return null;
}

/**
 * Extract creation date from MP4/M4A/MOV container via mvhd atom.
 */
function extractMp4CreationDate(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  const result = findBox(view, 0, buffer.byteLength, ["moov", "mvhd"]);
  if (!result) return null;

  const { offset } = result;
  const version = view.getUint8(offset);

  let creationTimeSecs: number;

  if (version === 0) {
    creationTimeSecs = view.getUint32(offset + 4);
  } else if (version === 1) {
    const high = view.getUint32(offset + 4);
    const low = view.getUint32(offset + 8);
    creationTimeSecs = high * 0x100000000 + low;
  } else {
    return null;
  }

  if (creationTimeSecs === 0) return null;

  const unixSeconds = creationTimeSecs - MAC_EPOCH_OFFSET;
  const date = new Date(unixSeconds * 1000);

  if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return null;

  console.log("[audio-creation-date] mvhd creation date:", date.toISOString());
  return date;
}

/**
 * Extract the creation/recording date from an audio file.
 * Reads up to 1MB from start and end of the file.
 */
export async function extractAudioCreationDate(file: File): Promise<Date | null> {
  try {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const mp4Types = ["m4a", "mp4", "mov", "aac"];

    if (mp4Types.includes(ext) || file.type.includes("mp4") || file.type.includes("m4a") || file.type.includes("audio/x-m4a")) {
      const firstChunk = file.slice(0, 1024 * 1024);
      const buffer = await firstChunk.arrayBuffer();

      // Priority 1: Apple QuickTime metadata
      const appleDate = extractAppleCreationDate(buffer);
      if (appleDate) {
        console.log("[audio-creation-date] Source: com.apple.quicktime.creationdate");
        return appleDate;
      }

      // Priority 2: mvhd atom
      const mvhdDate = extractMp4CreationDate(buffer);
      if (mvhdDate) {
        console.log("[audio-creation-date] Source: mvhd");
        return mvhdDate;
      }

      // Try last 1MB if moov wasn't in the first chunk
      if (file.size > 1024 * 1024) {
        const lastChunk = file.slice(Math.max(0, file.size - 1024 * 1024));
        const lastBuffer = await lastChunk.arrayBuffer();

        const appleDate2 = extractAppleCreationDate(lastBuffer);
        if (appleDate2) {
          console.log("[audio-creation-date] Source: com.apple.quicktime.creationdate (end of file)");
          return appleDate2;
        }

        const mvhdDate2 = extractMp4CreationDate(lastBuffer);
        if (mvhdDate2) {
          console.log("[audio-creation-date] Source: mvhd (end of file)");
          return mvhdDate2;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
