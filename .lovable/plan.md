
# Phase 6 — Share-recipient Art. 14 notice (UK / English only)

Understood: WhatSaid is UK-only, so the Art. 14 notice we send to share recipients is **English only**. Other jurisdictions need their own legally-reviewed wording, not a translation, so the plan drops every IT/FR locale path and the related fallback logic.

UK GDPR Art. 14 still requires the controller (the uploader) to inform identifiable people whose data is processed indirectly. Phase 5 made the uploader attest to that duty. Phase 6 makes WhatSaid actually deliver the told-once notice on their behalf and log that we did so.

## Current state (audit)

| Concern | Today | Gap |
|---|---|---|
| `share-transcript` email | Transcript/summary/PDF link with sender name | No Art. 14 information block |
| `share-transcript-record` email | Claim CTA only | Same gap |
| Claim page (`/claim/:token`) | Validates token, prompts sign-in/up, auto-claims | No notice surface |
| Audit trail | `consent_events` covers uploader's attestation only | No proof the recipient was informed |
| Notice copy | None | Need single English source of truth, versioned |

## Goal

Every share-by-email carries a clear English Art. 14 information block. The act of notifying is logged once per `(job, recipient, notice_version)` so we can prove the recipient was told. The same block appears on the claim page so a recipient who skimmed the email still sees it before taking a copy into their own account.

## Deliverables

### 1. Notice version (English only)

Seed `consent_versions` with `consent_type = 'share_recipient_notice'`, `version = '1.0.0'`. `text_en` covers the Art. 14 mandatory items; `text_it` and `text_fr` are left NULL (other-jurisdiction copy is out of scope).

Mandatory content:
- Controller identity — uploader's display name + reply-to email; WhatSaid as processor for this send
- Categories of personal data — voice recording → transcript, summary, anything dictated (names, locations, etc.)
- Purposes & legal basis — uploader's declared lawful basis from Phase 5
- Recipients — the named recipient only
- Retention — transcript stays in uploader's account under WhatSaid's published schedule; recipient's claimed copy follows the recipient's own retention if they accept
- Source — "audio uploaded by [sender]"
- Rights — access, rectification, erasure, objection, complaint to ICO, with WhatSaid contact + ICO link
- Opt-out path — `mailto:` to the sender's reply-to with a pre-filled subject referencing the share short id, plus link to `/privacy#share-recipients`

`text_hash` computed from `text_en`. Strings live in `src/lib/share-recipient-notice-strings.ts` exporting a single English block consumed by both the email and the claim page.

### 2. Email integration

Both `share-transcript/index.ts` and `share-transcript-record/index.ts`:
- Resolve the active `share_recipient_notice` version once per request.
- Render an English `<section>` immediately above the email footer in the HTML build, plus the same wording in the plain-text build.
- No subject-line change (preserves deliverability).
- No `recipient_locale` parameter — single English path keeps the surface small.

### 3. Audit row: `recipient_notifications`

Distinct from `consent_events` because the recipient is not consenting — we are recording that we informed them on the uploader's behalf.

```text
recipient_notifications
  id uuid pk
  job_id uuid not null
  shared_by uuid not null              -- uploader (controller)
  recipient_email_hash text not null   -- HMAC-SHA256 with CONSENT_IP_SALT_SECRET + daily salt
  channel text not null                -- 'share_transcript' | 'share_transcript_record'
  notice_type text not null            -- 'share_recipient_notice'
  notice_version text not null
  message_id text                      -- links to email_send_log when available
  notified_at timestamptz default now()
  unique (job_id, recipient_email_hash, notice_version)
```

Grants: `service_role` ALL; `authenticated` SELECT where `shared_by = auth.uid()`; admins SELECT all via `private.has_role`.

Share endpoints `INSERT ... ON CONFLICT DO NOTHING` so re-sharing the same transcript to the same recipient does not duplicate the row but still satisfies the told-once rule. On conflict, log `already_notified` for observability.

### 4. Claim-page surface

`src/pages/ClaimShare.tsx`: render the same English Art. 14 block above the "Open your copy" CTA inside `<section aria-label="Privacy information">`. A "Why am I seeing this?" disclosure expands inline with extra detail about WhatSaid's processor role and links to `/privacy#share-recipients`.

### 5. Uploader UI

`src/components/ShareButton.tsx` success toast: "Share sent — recipient was given a UK GDPR privacy notice." No new dialog — the uploader already attested in Phase 5.

### 6. Privacy policy

`src/pages/Privacy.tsx`: new `#share-recipients` anchor explaining what the recipient receives, WhatSaid's processor role on a share, and the recipient's options. Add a static `/privacy/share-notice` page rendering the active English version verbatim so recipients can read the full notice outside the email.

### 7. Recipient self-service objection (light-touch)

Email and claim page both expose a `mailto:` to the sender's reply-to with a pre-filled subject ("Please remove my voice from the recording shared via WhatSaid — [share short id]") and body referencing the job's short id. DSR self-service from Phase 3 still covers anything richer for account holders.

## Technical details

```text
share-transcript flow
  ┌──────────────────────────────────────────────────────┐
  │ requireAuth + quotas (unchanged)                     │
  │ load job, outputs (unchanged)                        │
  │ resolve active share_recipient_notice version (EN)   │
  │ build HTML/text with English notice above footer     │
  │ enqueue email (unchanged)                            │
  │ INSERT INTO recipient_notifications                  │
  │   ON CONFLICT (job, hash, version) DO NOTHING        │
  │ return { success: true, notice_logged: bool }        │
  └──────────────────────────────────────────────────────┘
```

Shared helper `supabase/functions/_shared/recipient-notice.ts` exposes:
- `resolveActiveNotice()` — single row lookup, cached per function lifetime
- `buildNoticeHtml(ctx)` and `buildNoticeText(ctx)` — pure English builders
- `recordRecipientNotification(serviceClient, …)` — HMACs the email and performs the insert

HMAC: reuses `CONSENT_IP_SALT_SECRET` with domain string `"recipient-email"`, rotated daily by UTC date — same approach as `record-consent`.

## Regression / test gate

- Vitest `src/test/share-recipient-notice-strings.test.ts` — asserts the English block contains the seven Art. 14 keywords (controller, purpose, basis, retention, rights, complaint, source).
- Deno tests:
  - `share-transcript/index.test.ts` (extend) — happy path includes Art. 14 block in HTML + text; second send to same recipient logs `already_notified`.
  - `share-transcript-record/index.test.ts` (new) — same matrix for the link-only variant.
  - `_shared/recipient-notice.test.ts` — pure unit tests on builders and HMAC stability across the daily window.
- SQL smoke: duplicate `INSERT` for the same `(job, hash, version)` does not error or duplicate.
- Manual checklist:
  - Fresh recipient → HTML and plain-text both show notice; `recipient_notifications` has one row.
  - Re-send same → no new row, `already_notified` logged.
  - Bump notice to `1.0.1` (manual seed) → next send creates a fresh row.
  - Claim page shows the same English notice before sign-in.
  - Keyboard nav reaches the notice section before the CTA.
  - Mobile ≤640px: notice section renders without overflow.

## Out of scope

- Translations or non-English notice copy (different jurisdictions need their own legal text, not a translation).
- Multi-recipient bulk shares.
- Storing the rendered notice HTML per send (version + `text_hash` reproduce it).
- Recipient-initiated automated deletion (handled via uploader + DSR flows).
- Subject-line changes.
