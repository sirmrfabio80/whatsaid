import { describe, it, expect } from "vitest";
import { detectRecoveryFromUrl } from "../recovery-url";

const BASE = "https://preview--whatsaid.lovable.app/reset-password";

describe("detectRecoveryFromUrl", () => {
  it("detects implicit hash recovery (access_token + type=recovery)", () => {
    const r = detectRecoveryFromUrl(
      `${BASE}#access_token=abc.def.ghi&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`,
    );
    expect(r.hasRecoveryHash).toBe(true);
    expect(r.isRecovery).toBe(true);
    expect(r.pkceCode).toBeNull();
  });

  it("detects hash with access_token but no explicit type", () => {
    const r = detectRecoveryFromUrl(`${BASE}#access_token=abc.def.ghi`);
    expect(r.hasRecoveryHash).toBe(true);
    expect(r.isRecovery).toBe(true);
  });

  it("detects explicit query ?type=recovery", () => {
    const r = detectRecoveryFromUrl(`${BASE}?type=recovery`);
    expect(r.hasRecoveryQuery).toBe(true);
    expect(r.isRecovery).toBe(true);
  });

  it("detects PKCE ?code= and exposes the code", () => {
    const r = detectRecoveryFromUrl(`${BASE}?code=pkce_one_time_code`);
    expect(r.hasRecoveryQuery).toBe(true);
    expect(r.pkceCode).toBe("pkce_one_time_code");
    expect(r.isRecovery).toBe(true);
  });

  it("detects custom email callback ?token_hash= and exposes the token hash", () => {
    const r = detectRecoveryFromUrl(`${BASE}?token_hash=hashed-token&type=recovery`);
    expect(r.hasRecoveryQuery).toBe(true);
    expect(r.tokenHash).toBe("hashed-token");
    expect(r.isRecovery).toBe(true);
  });

  it("returns false for a bare reset-password URL", () => {
    const r = detectRecoveryFromUrl(BASE);
    expect(r.isRecovery).toBe(false);
    expect(r.pkceCode).toBeNull();
    expect(r.tokenHash).toBeNull();
  });

  it("returns false for unrelated query params", () => {
    const r = detectRecoveryFromUrl(`${BASE}?foo=bar`);
    expect(r.isRecovery).toBe(false);
  });

  it("tolerates malformed input without throwing", () => {
    const r = detectRecoveryFromUrl("not a url");
    expect(r.isRecovery).toBe(false);
  });
});
