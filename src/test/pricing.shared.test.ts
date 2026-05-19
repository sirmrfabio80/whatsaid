/**
 * Parity guard between the client (src/lib/pricing.ts) and server
 * (supabase/functions/_shared/pricing.ts) pricing constants/functions.
 * Any drift here is a billing risk → fail the build.
 */
import { describe, it, expect } from "vitest";
import * as client from "@/lib/pricing";
import * as server from "../../supabase/functions/_shared/pricing";

describe("shared pricing parity", () => {
  it("constants match", () => {
    expect(server.MINUTES_PER_CREDIT).toBe(client.MINUTES_PER_CREDIT);
    expect(server.MAX_DURATION).toBe(client.MAX_DURATION);
    expect(server.MAX_FILE_SIZE).toBe(client.MAX_FILE_SIZE);
    expect(server.MAX_CREDITS_PER_FILE).toBe(4);
  });

  it.each([
    [0, 1],
    [60, 1],
    [120 * 60, 1],
    [120 * 60 + 1, 2],
    [240 * 60, 2],
    [240 * 60 + 1, 3],
    [360 * 60, 3],
    [480 * 60, 4],
  ])("creditsForDuration(%i) === %i in both modules", (sec, expected) => {
    expect(client.creditsForDuration(sec)).toBe(expected);
    expect(server.creditsForDuration(sec)).toBe(expected);
  });
});
