import { describe, it, expect } from "vitest";
import {
  parseSegments,
  reconstructContent,
  getUniqueSpeakers,
  getUniqueSpeakersFromContent,
  formatSegmentTimestamp,
} from "@/lib/transcript";

describe("parseSegments", () => {
  it("parses a line with timestamp + speaker + text", () => {
    const segs = parseSegments("[00:01:23] Alice: Hello world");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      index: 0,
      timestamp: "[00:01:23]",
      speaker: "Alice",
      text: "Hello world",
      raw: "[00:01:23] Alice: Hello world",
    });
  });

  it("parses a line with speaker but no timestamp", () => {
    const segs = parseSegments("Bob: Some text");
    expect(segs[0]).toMatchObject({
      timestamp: null,
      speaker: "Bob",
      text: "Some text",
    });
  });

  it("parses a plain text line with no speaker and no timestamp", () => {
    const segs = parseSegments("Just a sentence with no speaker");
    expect(segs[0]).toMatchObject({
      timestamp: null,
      speaker: null,
      text: "Just a sentence with no speaker",
    });
  });

  it("parses a timestamped line with no speaker", () => {
    const segs = parseSegments("[00:00:05] no speaker here");
    // Note: the regex requires "label: text" after timestamp, otherwise treated as text-only
    expect(segs[0].timestamp).toBe("[00:00:05]");
    expect(segs[0].speaker).toBeNull();
    expect(segs[0].text).toBe("no speaker here");
  });

  it("handles empty lines", () => {
    const segs = parseSegments("");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ speaker: null, text: "", raw: "" });
  });

  it("parses multiple lines preserving order and indices", () => {
    const content = "Alice: Hi\nBob: Hello\nAlice: Bye";
    const segs = parseSegments(content);
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(segs.map((s) => s.speaker)).toEqual(["Alice", "Bob", "Alice"]);
  });

  it("produces stable ids for the same input", () => {
    const a = parseSegments("Alice: Hello");
    const b = parseSegments("Alice: Hello");
    expect(a[0].id).toBe(b[0].id);
  });
});

describe("reconstructContent", () => {
  it("is the inverse of parseSegments for canonical input", () => {
    const content = "[00:01:23] Alice: Hello world\nBob: How are you\nFinal note";
    const segs = parseSegments(content);
    expect(reconstructContent(segs)).toBe(content);
  });

  it("omits the timestamp prefix when null", () => {
    const segs = parseSegments("Alice: Hi");
    expect(reconstructContent(segs)).toBe("Alice: Hi");
  });

  it("falls back to raw for empty segments with no text", () => {
    const segs = parseSegments("");
    expect(reconstructContent(segs)).toBe("");
  });
});

describe("getUniqueSpeakers", () => {
  it("returns unique speakers preserving first-seen order", () => {
    const segs = parseSegments("Alice: Hi\nBob: Hello\nAlice: Bye\nCarol: Yo");
    expect(getUniqueSpeakers(segs)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("ignores segments without a speaker", () => {
    const segs = parseSegments("just text\nAlice: Hi\nmore text");
    expect(getUniqueSpeakers(segs)).toEqual(["Alice"]);
  });

  it("returns an empty array when no speakers exist", () => {
    const segs = parseSegments("nothing\nhere either");
    expect(getUniqueSpeakers(segs)).toEqual([]);
  });

  it("getUniqueSpeakersFromContent matches the segment-based version", () => {
    const content = "Alice: Hi\nBob: Hello\nAlice: Bye";
    expect(getUniqueSpeakersFromContent(content)).toEqual(
      getUniqueSpeakers(parseSegments(content)),
    );
  });
});

describe("formatSegmentTimestamp", () => {
  it("strips brackets", () => {
    expect(formatSegmentTimestamp("[01:23:45]")).toBe("01:23:45");
  });

  it("drops the leading 00: hours component", () => {
    expect(formatSegmentTimestamp("[00:01:23]")).toBe("01:23");
  });

  it("keeps non-zero hours intact", () => {
    expect(formatSegmentTimestamp("[12:34:56]")).toBe("12:34:56");
  });

  it("handles a 00:00:00 timestamp", () => {
    expect(formatSegmentTimestamp("[00:00:00]")).toBe("00:00");
  });
});
