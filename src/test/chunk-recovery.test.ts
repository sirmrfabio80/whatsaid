import { describe, expect, it } from "vitest";
import { CHUNK_RECOVERY_CONFIG, planChunkReload } from "@/lib/chunk-recovery";

const FRESH = { attempts: 0, lastAt: 0 };

describe("planChunkReload", () => {
  it("reloads on the first failure", () => {
    const { action, nextState } = planChunkReload(FRESH, 1_000);
    expect(action).toBe("reload");
    expect(nextState).toEqual({ attempts: 1, lastAt: 1_000 });
  });

  it("respects the cooldown between consecutive failures", () => {
    const state = { attempts: 1, lastAt: 1_000 };
    const tooSoon = planChunkReload(state, 1_000 + 5_000);
    expect(tooSoon.action).toBe("skip-cooldown");
    expect(tooSoon.nextState).toEqual(state);
  });

  it("allows another reload once the per-attempt backoff has elapsed", () => {
    const state = { attempts: 1, lastAt: 1_000 };
    const backoff = CHUNK_RECOVERY_CONFIG.backoffMs[1];
    const { action, nextState } = planChunkReload(state, 1_000 + backoff + 1);
    expect(action).toBe("reload");
    expect(nextState.attempts).toBe(2);
  });

  it("stops reloading once maxAttempts is reached", () => {
    const state = { attempts: CHUNK_RECOVERY_CONFIG.maxAttempts, lastAt: 1_000 };
    // Stay within resetAfterMs so the counter is not cleared.
    const result = planChunkReload(state, 1_000 + 30_000);
    expect(result.action).toBe("skip-cap");
  });

  it("resets the counter after a long healthy gap", () => {
    const state = { attempts: 2, lastAt: 1_000 };
    const now = 1_000 + CHUNK_RECOVERY_CONFIG.resetAfterMs + 1;
    const { action, nextState } = planChunkReload(state, now);
    expect(action).toBe("reload");
    expect(nextState).toEqual({ attempts: 1, lastAt: now });
  });

  it("uses the last backoff value for attempts beyond the configured array", () => {
    const config = { maxAttempts: 10, backoffMs: [1_000, 2_000], resetAfterMs: 1_000_000 };
    const state = { attempts: 5, lastAt: 10_000 };
    const tooSoon = planChunkReload(state, 11_500, config);
    expect(tooSoon.action).toBe("skip-cooldown");
    const ok = planChunkReload(state, 12_500, config);
    expect(ok.action).toBe("reload");
  });
});
