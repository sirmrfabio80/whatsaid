import { describe, expect, it } from "vitest";

import { extractAudioCreationDate } from "@/lib/audio-creation-date";

function textBytes(value: string) {
  return Array.from(new TextEncoder().encode(value));
}

function uint32(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function str4(value: string) {
  return Array.from(value).map((char) => char.charCodeAt(0));
}

function box(type: string, payload: number[]) {
  return [...uint32(payload.length + 8), ...str4(type), ...payload];
}

function keyEntry(name: string) {
  const nameBytes = textBytes(name);
  return [...uint32(nameBytes.length + 8), ...str4("mdta"), ...nameBytes];
}

function metadataItem(index: number, value: string) {
  const valueBytes = textBytes(value);
  const dataBox = box("data", [...uint32(1), ...uint32(0), ...valueBytes]);
  return [...uint32(dataBox.length + 8), ...uint32(index), ...dataBox];
}

function buildSampleM4a(isoValue: string) {
  const paddingBox = box("free", new Array(1024 * 1024 + 64).fill(0));
  const keysBox = box("keys", [...uint32(0), ...uint32(1), ...keyEntry("com.apple.quicktime.creationdate")]);
  const ilstBox = box("ilst", metadataItem(1, isoValue));
  const metaBox = box("meta", [...uint32(0), ...keysBox, ...ilstBox]);
  const udtaBox = box("udta", metaBox);
  const moovBox = box("moov", [...paddingBox, ...udtaBox]);
  const ftypBox = box("ftyp", [...str4("M4A "), ...uint32(0), ...str4("isom")]);

  return new Uint8Array([...ftypBox, ...moovBox]);
}

describe("extractAudioCreationDate", () => {
  it("reads Apple creation metadata even when it lives beyond the first 1MB", async () => {
    const isoValue = "2026-03-13T10:49:00+01:00";
    const bytes = buildSampleM4a(isoValue);
    const file = new File([bytes], "Villa Ida.m4a", {
      type: "audio/mp4",
      lastModified: Date.parse("2026-04-11T13:37:03Z"),
    });

    const result = await extractAudioCreationDate(file);

    expect(result).not.toBeNull();
    expect(result?.toISOString()).toBe("2026-03-13T09:49:00.000Z");
  });
});

