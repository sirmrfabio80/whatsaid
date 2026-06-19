# E2E password-reset test

Verifies the full Dev password-reset flow against the deployed preview app:

1. Signs in as an admin user using `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.
2. Calls the `admin-generate-reset-link` edge function for the target user.
3. Navigates the browser to the returned recovery link.
4. Sets a brand-new password in the `/reset-password` form.
5. Signs in with the new password to prove it works.

## Required env vars

| Variable                          | Purpose                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `E2E_BASE_URL` (optional)         | App URL. Defaults to the Dev preview URL.               |
| `E2E_ADMIN_EMAIL`                 | Admin account used to call the edge function.           |
| `E2E_ADMIN_PASSWORD`              | Admin password.                                         |
| `E2E_TARGET_EMAIL` (optional)     | User whose password gets reset. Defaults to admin.      |

The admin user must have the `admin` role in `public.user_roles`.

## Running

```bash
bunx playwright install chromium   # first time only
E2E_ADMIN_EMAIL=...@example.com \
E2E_ADMIN_PASSWORD=... \
bunx playwright test
```

The test will reset the target account's password to a fresh random value
on every run, then immediately log in with it — so the previous password is
invalidated. Use a dedicated test account.
