/**
 * Extract the recording creation date from an audio file's binary metadata.
 *
 * Returns the raw ISO string (never parsed through `new Date()`) and the source.
 *
 * Priority:
 * 1. com.apple.quicktime.creationdate from keys/ilst metadata (ISO 8601 with timezone)
 * 2. mvhd creation_time (Mac epoch, UTC)
 * 3. null (caller falls back to file.lastModified)
 */

export interface AudioCreationDateResult {
  /** The chosen ISO string based on priority */
  isoString: string;
  /** Which source was chosen */
  source: "apple_metadata" | "mvhd_creation" | "file_last_modified";
  /** All raw values found — for debugging / cross-checking */
  allSources: {
    apple_metadata: string | null;
    mvhd_creation: string | null;
  };
  /** ISO 6709 location string if found (e.g. "+45.4642+009.1900+100.000/") */
  locationISO6709: string | null;
}

const MAC_EPOCH_OFFSET = 2082844800;

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

    if (type === target) {
      const skip = skipBytesForContainer?.[0] ?? 0;
      const contentOffset = pos + headerSize + skip;
      const contentSize = size - headerSize - skip;
      if (contentSize < 0) return null;

      if (path.length === 1) {
        return { offset: contentOffset, size: contentSize };
      }

      return findBox(
        view,
        contentOffset,
        pos + size,
        path.slice(1),
        skipBytesForContainer?.slice(1)
      );
    }

    pos += size;
  }
  return null;
}

function readString(view: DataView, offset: number, length: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(view.getUint8(offset + i));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

async function readBlobAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file buffer"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Validate that a string looks like a plausible ISO 8601 date.
 */
function isPlausibleIso(s: string): boolean {
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100;
}

function extractAppleMetadataKey(buffer: ArrayBuffer, targetKey: string): string | null {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  const metaBox = findBox(view, 0, byteLength, ["moov", "udta", "meta"], [0, 0, 4]);
  if (!metaBox) return null;

  const metaStart = metaBox.offset;
  const metaEnd = metaBox.offset + metaBox.size;

  const keysBox = findBox(view, metaStart, metaEnd, ["keys"]);
  if (!keysBox) return null;

  const keysDataStart = keysBox.offset;
  const keyCount = view.getUint32(keysDataStart + 4);

  let targetKeyIndex = -1;
  let keyPos = keysDataStart + 8;

  for (let i = 0; i < keyCount; i++) {
    if (keyPos + 8 > keysBox.offset + keysBox.size) break;
    const keySize = view.getUint32(keyPos);
    const keyValueLength = keySize - 8;
    if (keyValueLength > 0 && keyPos + 8 + keyValueLength <= keysBox.offset + keysBox.size) {
      const keyName = readString(view, keyPos + 8, keyValueLength);
      if (keyName === targetKey) {
        targetKeyIndex = i + 1;
        break;
      }
    }
    keyPos += keySize;
  }

  if (targetKeyIndex < 0) return null;

  const ilstBox = findBox(view, metaStart, metaEnd, ["ilst"]);
  if (!ilstBox) return null;

  let ilstPos = ilstBox.offset;
  const ilstEnd = ilstBox.offset + ilstBox.size;

  while (ilstPos < ilstEnd - 8) {
    const itemSize = view.getUint32(ilstPos);
    if (itemSize < 8) break;

    const itemIndex = view.getUint32(ilstPos + 4);

    if (itemIndex === targetKeyIndex) {
      const dataBox = findBox(view, ilstPos + 8, ilstPos + itemSize, ["data"]);
      if (!dataBox) break;

      const valueOffset = dataBox.offset + 8;
      const valueLength = dataBox.size - 8;
      if (valueLength <= 0) break;

      return readString(view, valueOffset, valueLength).trim();
    }

    ilstPos += itemSize;
  }

  return null;
}

function extractAppleCreationDate(buffer: ArrayBuffer): string | null {
  const raw = extractAppleMetadataKey(buffer, "com.apple.quicktime.creationdate");
  if (!raw) return null;
  console.log("[audio-creation-date] Raw Apple creationdate:", raw);
  if (!isPlausibleIso(raw)) return null;
  return raw;
}

function extractAppleLocation(buffer: ArrayBuffer): string | null {
  const raw = extractAppleMetadataKey(buffer, "com.apple.quicktime.location.ISO6709");
  if (!raw) return null;
  console.log("[audio-creation-date] Raw Apple location:", raw);
  // Basic validation: should start with + or -
  if (!/^[+-]/.test(raw)) return null;
  return raw;
}

function extractMp4CreationDate(buffer: ArrayBuffer): string | null {
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

  const unixMs = (creationTimeSecs - MAC_EPOCH_OFFSET) * 1000;
  const d = new Date(unixMs);

  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;

  // Construct explicit UTC ISO string
  const iso = d.toISOString();
  console.log("[audio-creation-date] mvhd creation date:", iso);
  return iso;
}

/**
 * Extract the creation/recording date from an audio file.
 * Returns the raw ISO string and source identifier — never a Date object.
 */
export async function extractAudioCreationDate(file: File): Promise<AudioCreationDateResult | null> {
  try {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const mp4Types = ["m4a", "mp4", "mov", "aac"];

    if (mp4Types.includes(ext) || file.type.includes("mp4") || file.type.includes("m4a") || file.type.includes("audio/x-m4a")) {
      const buffer = await readBlobAsArrayBuffer(file);

      // Extract all available sources
      const appleIso = extractAppleCreationDate(buffer);
      const mvhdIso = extractMp4CreationDate(buffer);
      const locationISO6709 = extractAppleLocation(buffer);

      const allSources = {
        apple_metadata: appleIso,
        mvhd_creation: mvhdIso,
      };

      console.log("[audio-creation-date] All sources:", allSources, "location:", locationISO6709);

      // Priority 1: Apple QuickTime metadata
      if (appleIso) {
        console.log("[audio-creation-date] Chosen source: com.apple.quicktime.creationdate");
        return { isoString: appleIso, source: "apple_metadata", allSources, locationISO6709 };
      }

      // Priority 2: mvhd atom
      if (mvhdIso) {
        console.log("[audio-creation-date] Chosen source: mvhd");
        return { isoString: mvhdIso, source: "mvhd_creation", allSources, locationISO6709 };
      }

      // No date found but maybe location was found — return null for date
      // Location will still be accessible via the full extraction in Convert page
      if (locationISO6709) {
        return { isoString: new Date(file.lastModified).toISOString(), source: "file_last_modified", allSources, locationISO6709 };
      }
    }

    return null;
  } catch (error) {
    console.warn("[audio-creation-date] Extraction failed:", error);
    return null;
  }
}
