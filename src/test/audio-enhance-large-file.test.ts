/**
 * Regression test for the "TypeError: Load failed" Safari error when
 * uploading a large m4a file.
 *
 * The user's reproducer: a ~39 MB / 40-min .m4a uploaded via Convert.tsx
 * fails because `decodeAudioData` (called from both the worker streaming
 * path and the legacy in-memory path) throws "TypeError: Load failed" on
 * Safari for large m4a inputs.
 *
 * Fix: enhanceAudioForTranscriptionAuto must NOT attempt to decode files
 * above the safe-decode ceiling. It must instead pass through the original
 * file with `metadata.reason = "failed"`, so the upload step can proceed
 * and the transcription provider receives the original audio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enhanceAudioForTranscriptionAuto } from "@/lib/audio-enhance";

function makeFakeFile(sizeBytes: number, name = "Villa_Ida_Logopedista-2.m4a", type = "audio/mp4"): File {
  // We don't actually need real bytes — only File.size and File.name are
  // read by the auto-router's size gate. Allocate one byte and lie about
  // size via a Proxy so we don't blow up jsdom memory.
  const blob = new Blob([new Uint8Array(1)], { type });
  const file = new File([blob], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes, configurable: true });
  return file;
}

describe("enhanceAudioForTranscriptionAuto — large file safety net", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips decode and returns the original file for a 39 MB m4a (Safari decode-fail repro)", async () => {
    // jsdom has no AudioContext, so without the size gate the auto-router
    // would throw before returning. The fix must bail out before any
    // decode attempt.
    const file = makeFakeFile(39 * 1024 * 1024);
    const onProgress = vi.fn();

    const result = await enhanceAudioForTranscriptionAuto(file, onProgress);

    expect(result.metadata.applied).toBe(false);
    expect(result.metadata.reason).toBe("failed");
    expect(result.file.size).toBe(file.size);
    // Filename is sanitised but extension preserved.
    expect(result.file.name.endsWith(".m4a")).toBe(true);
    // No "decoding" / "processing" / "encoding" stages should fire — we
    // never touched the audio.
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("skips decode for any file above the 25 MB safe-decode ceiling", async () => {
    const file = makeFakeFile(26 * 1024 * 1024, "huge.mp3", "audio/mpeg");
    const result = await enhanceAudioForTranscriptionAuto(file);
    expect(result.metadata.reason).toBe("failed");
    expect(result.file.size).toBe(file.size);
  });
});
