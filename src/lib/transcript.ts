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
