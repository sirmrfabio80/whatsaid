## Goal

Get an email at **sirfabio@icloud.com** every time:
1. A new user signs up
2. A user completes a credit purchase (Paddle transaction)

## Approach

Use Lovable's built-in transactional email system (the domain `notify.whatsaid.app` is already configured for auth emails, so no DNS work is needed). Add two simple admin-notification templates and trigger them from the existing server-side code paths so events can never be missed (even purchases made while you're offline).

## Steps

1. **Set up transactional email infrastructure**
   - Provision the email queue, send log, suppression list, and `process-email-queue` cron (shared with auth emails).
   - Scaffold the `send-transactional-email` edge function and template registry.

2. **Create two admin templates** in `supabase/functions/_shared/transactional-email-templates/`:
   - `admin-new-signup.tsx` — shows new user's email, display name, signup timestamp.
   - `admin-credit-purchase.tsx` — shows buyer email, package (1 / 5 / 20 credits), amount, Paddle transaction id, new balance.
   - Both branded with WhatSaid colors (primary `hsl(250 75% 55%)`, Space Grotesk headings).

3. **Wire the signup trigger**
   - Extend `handle_new_user` DB trigger flow: simplest reliable path is to call `send-transactional-email` from a tiny new edge function `notify-admin-signup` invoked via a Postgres trigger / Auth webhook. Cleaner alternative: add the invocation directly inside `auth-email-hook` when `email_action_type === 'signup'` — it already runs on every signup and has the user email. **We'll use the auth-email-hook path** to avoid new infrastructure.

4. **Wire the purchase trigger**
   - In `supabase/functions/paddle-webhook/index.ts`, after the successful `add_credits` call, invoke `send-transactional-email` with the `admin-credit-purchase` template. Failures here are logged but do not fail the webhook (Paddle would retry).

5. **Hardcode admin recipient**
   - Store `ADMIN_NOTIFY_EMAIL = "sirfabio@icloud.com"` as a constant in `supabase/functions/_shared/constants.ts` so both triggers reuse it.

6. **Deploy** the modified `auth-email-hook`, `paddle-webhook`, and new `send-transactional-email` functions.

## Technical notes

- `idempotencyKey`: `signup-${user.id}` and `purchase-${paddle_transaction_id}` — guarantees no duplicate emails if a webhook retries.
- Recipient is the admin, not the user, so suppression list won't interfere unless you ever unsubscribe yourself.
- No schema migrations needed beyond what `setup_email_infra` creates automatically.
- No UI changes.

## Out of scope

- Daily/weekly digest format (this plan is real-time per event).
- In-app notifications (the existing notifications system stays for user-facing events).
- Failed-payment / refund alerts (can be added later by handling more Paddle event types).
