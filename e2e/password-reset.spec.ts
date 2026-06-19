import { test, expect, request as pwRequest } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://gidjkdtmagxuzhlntlbt.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const TARGET_EMAIL = process.env.E2E_TARGET_EMAIL ?? ADMIN_EMAIL;

test.describe("password reset E2E", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_ANON_KEY,
    "Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD (and VITE_SUPABASE_PUBLISHABLE_KEY in env)",
  );

  test("admin generates reset link, user sets new password and logs in", async ({
    page,
    baseURL,
  }) => {
    const redirectTo = `${baseURL}/reset-password`;
    const newPassword = `E2E-${crypto.randomUUID()}-Aa1!`;

    // 1. Authenticate as admin against Supabase to get a JWT.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(signInErr, `admin sign-in failed: ${signInErr?.message}`).toBeNull();
    const accessToken = signIn.session?.access_token;
    expect(accessToken, "missing admin access token").toBeTruthy();

    // 2. Call the admin-only edge function to mint a recovery link.
    const api = await pwRequest.newContext();
    const fnRes = await api.post(
      `${SUPABASE_URL}/functions/v1/admin-generate-reset-link`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        data: { email: TARGET_EMAIL, redirectTo },
      },
    );
    expect(
      fnRes.ok(),
      `edge fn ${fnRes.status()}: ${await fnRes.text()}`,
    ).toBeTruthy();
    const fnBody = (await fnRes.json()) as { action_link?: string; recovery_url?: string };
    const resetUrl = fnBody.recovery_url ?? fnBody.action_link;
    expect(resetUrl, "no reset URL returned").toBeTruthy();

    // 3. Follow the recovery link in the browser.
    await page.goto(resetUrl!);
    await page.waitForURL(/\/reset-password/, { timeout: 30_000 });

    // The password form must render (not the "Invalid reset link" view).
    const newPasswordInput = page.locator("#new-password");
    await expect(newPasswordInput).toBeVisible({ timeout: 20_000 });
    const confirmInput = page.locator("#confirm-password");

    // 4. Submit a new password.
    await newPasswordInput.fill(newPassword);
    await confirmInput.fill(newPassword);
    await page.locator('button[type="submit"]').click();

    // After success the page navigates to "/" within ~2s.
    await page.waitForURL((url) => !url.pathname.startsWith("/reset-password"), {
      timeout: 20_000,
    });

    // 5. Sign out any lingering session, then log in with the new password.
    await supabase.auth.signOut().catch(() => {});

    const verify = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: relogin, error: reloginErr } = await verify.auth.signInWithPassword({
      email: TARGET_EMAIL,
      password: newPassword,
    });
    expect(
      reloginErr,
      `login with new password failed: ${reloginErr?.message}`,
    ).toBeNull();
    expect(relogin.session?.access_token).toBeTruthy();

    // Restore admin password if we reset the admin's own account, so the
    // suite stays runnable. Only do this when admin === target AND the
    // original password is known.
    if (TARGET_EMAIL.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      const { error: restoreErr } = await verify.auth.updateUser({
        password: ADMIN_PASSWORD,
      });
      expect(
        restoreErr,
        `failed to restore admin password: ${restoreErr?.message}`,
      ).toBeNull();
    }
  });
});
