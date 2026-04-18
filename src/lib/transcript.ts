/**
 * Transcript parsing primitives.
 *
 * A transcript is stored as plain text where each line is a "segment":
 *   [HH:MM:SS] Speaker Label: utterance text
 *
 * Both the timestamp prefix and the speaker label are optional.
 *
 * `parseSegments` is shared between the editor (TranscriptEditor),
 * the results page (JobResults), and any feature that needs to read
 * the structured form of a transcript without re-implementing the regex.
 */

export interface Segment {
  id: string;
  index: number;
  speaker: string | null;
  text: string;
  raw: string;
  timestamp: string | null;
}

export interface SpeakerSuggestion {
  id: string;
  confidence: number;
  speaker: string;
}

export function parseSegments(content: string): Segment[] {
  return content.split("\n").map((line, index) => {
    const snippet = line.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "");
    const id = `seg-${index}-${line.length}-${snippet}`;
    // Handle optional [HH:MM:SS] timestamp prefix before speaker label
    const tsMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s/);
    const timestamp = tsMatch ? tsMatch[1] : null;
    const afterTs = timestamp ? line.slice(timestamp.length + 1) : line;
    const match = afterTs.match(/^(.+?):\s(.*)/);
    if (match) {
      return { id, index, speaker: match[1], text: match[2], raw: line, timestamp };
    }
    return { id, index, speaker: null, text: afterTs, raw: line, timestamp };
  });
}

/**
 * Inverse of `parseSegments` — serializes a list of segments back to the
 * canonical transcript text format.
 */
export function reconstructContent(segments: Segment[]): string {
  return segments
    .map((s) => {
      const prefix = s.timestamp ? `${s.timestamp} ` : "";
      if (s.speaker) return `${prefix}${s.speaker}: ${s.text}`;
      return s.text || s.raw;
    })
    .join("\n");
}

/**
 * Returns the de-duplicated list of speaker labels present in a list of
 * segments, preserving first-seen order.
 */
export function getUniqueSpeakers(segments: Segment[]): string[] {
  const speakers = new Set<string>();
  segments.forEach((s) => {
    if (s.speaker) speakers.add(s.speaker);
  });
  return [...speakers];
}

/** Convenience: parse a raw transcript string and return its unique speaker labels. */
export function getUniqueSpeakersFromContent(content: string): string[] {
  return getUniqueSpeakers(parseSegments(content));
}

/**
 * Format a `[HH:MM:SS]` segment timestamp for display: strips brackets and
 * drops a leading `00:` hours component when present (e.g. `[00:01:23]` → `01:23`).
 */
export function formatSegmentTimestamp(ts: string): string {
  const clean = ts.replace(/[\[\]]/g, "");
  return clean.startsWith("00:") ? clean.slice(3) : clean;
}
