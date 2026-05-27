## Phase 1 (revised) — Reg. 37 acknowledgement at Paddle checkout

Incorporates your review. Material issues #1–#4 are folded in; quality items #5–#10 are accepted as listed; nits adopted.

### Why this first
A UK consumer can today buy a credit pack via Paddle, consume credits, and still validly exercise the 14-day cancellation right under reg. 29 of the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. Reg. 37 extinguishes that right only if, **before supply begins**, the consumer (a) expressly consents to immediate supply and (b) acknowledges the resulting loss of the cancellation right. The current checkout (`openCheckout` in `src/lib/paddle-checkout.ts`) captures neither.

### Definition we are adopting (#3)
- **"Supply begins" = the moment credits are credited to the user's wallet** (i.e. on a successful `transaction.completed` Paddle webhook). This is the conservative-to-the-consumer-but-still-Reg.37-valid reading, and it matches what we already do.
- **Refund posture (#4):** unused full packs remain refundable on request within 14 days. Once any credit from a pack has been consumed, the cancellation right is extinguished under reg. 37; partial-consumption refunds are at WhatSaid's discretion and not a statutory entitlement. This wording goes into `RefundPolicy.tsx` and is referenced from `Terms.tsx`.
- Solicitor must confirm whether a credit pack is "digital content" or "digital service" under the 2013 Regs; the plan implicitly treats it as digital content. (Nit accepted.)

### What changes

**1. New table `consent_versions` (#1, #8) — self-contained evidence**
- `version` (PK, e.g. `cca2013.reg37.immediate-supply.2026-05-v1`)
- `consent_type` text (namespaced: `cca2013.reg37.immediate-supply`)
- `text_en`, `text_it`, `text_fr` (the literal wording shown to users — both checkbox labels + explanatory paragraph, as JSON or three text cols)
- `effective_from`, `effective_to` (nullable)
- `text_hash` text — `sha256(text_en || text_it || text_fr)` first 16 chars; UNIQUE
- RLS: `SELECT` to `authenticated`; only `service_role` may INSERT
- Seeded by the migration with the launch version. Subsequent versions inserted by a service-role admin tool (out of scope for Phase 1).
- The frontend constant `REG37_CONSENT_VERSION` is computed at build/runtime from `sha256(text)` and asserted against the row pulled from the DB, so editing the strings without seeding a new row fails loudly (replaces the "remember to bump" footgun in #8).

**2. New table `consent_events` — per-purchase contract evidence**
- `id uuid PK`, `user_id`, `consent_type`, `version` (FK → `consent_versions.version`), `package_id`, `ip_hash`, `user_agent` (≤255 chars), `accepted_at`, `metadata jsonb`
- RLS: users SELECT their own; `service_role` ALL.
- Index on (`user_id`, `consent_type`, `accepted_at DESC`).
- **Retention horizon (#7):** designed for **6-year retention** (Limitation Act 1980, breach-of-contract). Storage estimate and any future cascade-delete in Phase 2 must respect this. No FK on `user_id` — when an account is deleted in `delete-account`, consent rows are anonymised (set `user_id = NULL`, scrub `ip_hash` and `user_agent`) rather than deleted, so the audit trail survives Right to Erasure for legitimate-interest legal-defence retention.

**3. `record-consent` edge function**
- JWT-validated via `requireAuth`.
- Zod body: `{ consent_type, version, package_id }`.
- Verifies `version` exists in `consent_versions` and is currently effective; rejects 409 otherwise.
- Computes `ip_hash = HMAC-SHA256(env CONSENT_IP_SALT_SECRET, today_yyyymmdd_utc || ip)` (#6 — HMAC of an env secret keyed by day; correlation across days is intentionally impossible, which is the desired privacy property).
- Inserts a `consent_events` row, returns `{ ok: true, consent_id }`.

**4. Pre-checkout consent dialog**
- New `Reg37ConsentDialog` component (shadcn `Dialog`).
- Two **separately required** checkboxes (kept as-is — you confirmed this is right):
  1. "I want my credits to be made available immediately after payment so I can start transcribing right away."
  2. "I understand that, because I am requesting immediate supply, I will lose my statutory 14-day right to cancel under the Consumer Contracts Regulations 2013 once those credits are credited to my account."
- Short paragraph with link to `/refund-policy`.
- Accessibility (#9, explicit): focus trap, ESC closes (Continue stays disabled), `aria-describedby` ties the paragraph to the dialog, both checkbox labels fully wrap at 320 px, all interactive targets ≥44 px, respects `prefers-reduced-motion`.
- **Always shown per purchase, never session-cached (#10).** Closing the dialog (X / outside click / ESC) records nothing and does not open Paddle.

**5. Wire consent_id into Paddle (#2)**
- `openCheckoutWithConsent(opts)` wraps the existing `openCheckout`. Flow:
  1. Open `Reg37ConsentDialog`.
  2. On both-ticked + Continue → POST `record-consent` → receive `consent_id`.
  3. Call `openCheckout({ ...opts, customData: { user_id, consent_id, consent_version } })`.
- `paddle-webhook` reads `data.custom_data.consent_id` and `consent_version` and:
  - If present → verify the row exists, belongs to the same `user_id`, and matches the version; record `metadata.paddle_transaction_id` on the consent row.
  - If absent or mismatched → **still grant credits** (your call, correct), but emit a **hard requirement** admin alert via existing transactional-email infra and write an audit row to a new `consent_audit_anomalies` table (or to `consent_events.metadata` as a flagged row). Drops the 30-minute time-window entirely.
- All call sites switch to `openCheckoutWithConsent`: `PricingTeaserStrip`, Pricing page, out-of-credits prompts in `Convert.tsx` and `History.tsx`.

**6. i18n posture for legally-binding text (#5)**
- Phase 1 ships **EN-only** for the consent dialog and the two checkbox labels — the consent text is legal artefact, not UX copy. Users on IT/FR UI still see the consent strings in English. The surrounding non-binding chrome (titles, button labels) remains translated.
- `it_text` / `fr_text` columns in `consent_versions` are left NULL on the launch row; populated later only after a qualified UK-law legal translator review. The schema is already there; only the seeding is deferred.

**7. Policy copy updates**
- `RefundPolicy.tsx`: explicit Reg. 37 narrative — "supply begins when credits land in your wallet"; unused full packs refundable within 14 days; partial-consumption refunds are discretionary.
- `Terms.tsx`: short paragraph mirroring the same rule, linking to Refund Policy as the single source of truth.
- EN copy updated; IT/FR untouched in this phase (consistent with #5).

### Out of scope (deferred to later plans)
- Retention/pruning of `consent_events` (Phase 2 — set the 6y rule).
- Self-service consent history export (Phase 3 — DSR).
- Cookie banner, uploader attestation, share-recipient Art. 14 notice, full policy rewrite, accessibility statement page.
- Admin UI to seed new `consent_versions` rows (manual SQL via service role for now).

### Regression test gate

**Vitest (`src/test/reg37-consent.test.tsx`):**
- Dialog: Continue disabled until both checkboxes ticked.
- Closing the dialog (X, ESC, outside click) → `record-consent` NOT called, `openCheckout` NOT called. *(adds the missing test you flagged)*
- On Continue → `record-consent` called once with the version derived from the visible text hash; `openCheckout` called with `customData.consent_id` set.
- If `record-consent` rejects → checkout never opens, toast shown.
- Accessibility: focus trap traps; both labels rendered without truncation at 320 px width.

**Deno edge tests:**
- `record-consent`: rejects anon, rejects unknown/expired version, rejects malformed body, accepts valid request and writes one row whose `ip_hash` is HMAC-shaped (64 hex chars).
- `paddle-webhook`: with valid `consent_id` in `custom_data` → credits granted + consent row updated with tx id, no anomaly written; with missing `consent_id` → credits still granted + anomaly row written + admin alert dispatched.

**SQL smoke:**
- Service role can INSERT into `consent_events`; authenticated user can only SELECT own; UPDATE/DELETE denied for client roles.
- `consent_versions` SELECT works for authenticated; INSERT denied.

**Manual E2E:**
1. Buy £4.99 pack — dialog appears, both checkboxes required, `consent_events` row written with the new version, Paddle opens, webhook links the row to the tx id, credits granted.
2. Devtools bypass: call `openCheckout` directly without consent → Paddle opens, webhook fires, credits granted, **anomaly row + admin email present**.
3. 3DS challenge scenario (delayed `transaction.completed`) — consent_id still resolves the link regardless of elapsed time. *(replaces the 30-min window)*
4. EN/IT/FR users all see the consent dialog in English in Phase 1.
5. Existing `src/test/pricing.shared.test.ts` still passes; no pricing math changed.

### Technical details

```text
Migration (new tables, seed launch version)
───────────────────────────────────────────
CREATE TABLE public.consent_versions (
  version text PRIMARY KEY,
  consent_type text NOT NULL,
  text_en text NOT NULL,
  text_it text,
  text_fr text,
  text_hash text NOT NULL UNIQUE,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz
);
GRANT SELECT ON public.consent_versions TO authenticated;
GRANT ALL ON public.consent_versions TO service_role;
ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read consent versions"
  ON public.consent_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                    -- nullable to survive account deletion (audit)
  consent_type text NOT NULL,      -- e.g. 'cca2013.reg37.immediate-supply'
  version text NOT NULL REFERENCES public.consent_versions(version),
  package_id text,
  ip_hash text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb                   -- { paddle_transaction_id, anomaly?: true, ... }
);
GRANT SELECT ON public.consent_events TO authenticated;
GRANT ALL ON public.consent_events TO service_role;
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own consents"
  ON public.consent_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX idx_consent_events_user_type
  ON public.consent_events(user_id, consent_type, accepted_at DESC);

-- Seed the launch version
INSERT INTO public.consent_versions (version, consent_type, text_en, text_hash)
VALUES (
  'cca2013.reg37.immediate-supply.2026-05-v1',
  'cca2013.reg37.immediate-supply',
  '<full literal EN text of both checkboxes + paragraph>',
  '<sha256 first 16 chars>'
);

Edge function: supabase/functions/record-consent/index.ts
  - requireAuth
  - zod { consent_type, version, package_id }
  - look up version row; reject if missing or effective_to < now()
  - HMAC-SHA256(env CONSENT_IP_SALT_SECRET, yyyymmdd_utc || ip) → ip_hash
  - insert consent_events; return { ok, consent_id }

Frontend (src/lib/paddle-checkout.ts)
  - openCheckoutWithConsent(opts) wraps openCheckout
  - passes customData.consent_id + customData.consent_version through to Paddle

Webhook (supabase/functions/paddle-webhook/index.ts)
  - read consent_id + consent_version from event.data.custom_data
  - link to consent row OR insert anomaly + dispatch admin email (hard requirement)
  - credits still granted in both branches
```

New secret to add: `CONSENT_IP_SALT_SECRET` (random 32-byte hex). I'll request it via `add_secret` at the start of build mode.

### Deliverables
- 1 migration (two tables + seed)
- 1 new edge function (`record-consent`)
- 1 new dialog component + 1 checkout wrapper
- `paddle-webhook` updated to verify + audit
- Copy updates in `RefundPolicy.tsx`, `Terms.tsx` (EN)
- Vitest + Deno tests
- `docs/ARCHITECTURE.md` §3 updated
