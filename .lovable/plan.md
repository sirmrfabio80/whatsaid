# Transcript Sharing — Revised Remediation Plan

Scope is bounded to sharing. Phase order preserved: migration + Phase 1 first.

## Repo reconciliation (verified)

- `consent_events` **and** `consent_versions` both exist — keep using `consent_events` for per-acknowledgement audit rows and `consent_versions` for the versioned legal text (no new table needed).
- `src/pages/ClaimShare.tsx` and `src/pages/SharedPdfDownload.tsx` exist — extend, do not create.
- Existing edge functions: `share-transcript`, `share-transcript-record`, `claim-transcript-share`, `download-shared-pdf`, `cleanup-expired-shares`. New gated viewer needs: `request-share-otp`, `verify-share-otp`, `view-shared-transcript` (or fold into `share-transcript-record`). To decide at build time.
- `transcript_shares` and `retention_config` tables present — add `expires_at` discipline (2-day TTL already enforced in copy) and new per-view audit rows referenced from `retention_config`.

## Lawful basis (precise)

Two purposes, two bases:

- **Sender's transcript processing** — Art. 6(1)(b) UK GDPR: necessary to perform the WhatSaid service contracted for, which includes the share feature.
- **Recipient email-address processing (deliver the share)** — Art. 6(1)(f) UK GDPR. A one-page **Legitimate Interests Assessment** is written as part of Phase 1 (not retrofitted):
  - *Purpose*: enable user-initiated 1:1 delivery of their own document.
  - *Necessity*: cannot deliver to a named recipient without their address; no less intrusive route.
  - *Balance*: minimal data (email only), single transactional message, no marketing, recipient gets an Art. 14 notice on first view, easy objection/erasure route, short retention.

Possible special-category content inside transcripts raises the **Art. 32** security bar (encryption in transit, gated access, short TTL, audit). It does **not** require a separate Art. 9(2) condition for the share feature itself — the sender controls disclosure of their own document and any embedded special-category content rides on the original Art. 9 basis already in place for transcription.

## PECR position

A user-initiated 1:1 share is **not direct marketing**, so PECR reg. 22 is out of scope. Phase 4 From/Reply-To hygiene is kept, justified on **UK GDPR Art. 5(1)(a) transparency and fairness** and avoiding mischaracterisation as WhatSaid-originated mail.

## Accessibility (WCAG 2.1 AA) — acceptance criteria for every new/changed UI

Required for SharedView, OTP input, and the recipient-becomes-controller modal:

- Labelled OTP field (`<label>` + `aria-describedby` for hint/error), `inputmode="numeric"`, `autocomplete="one-time-code"`.
- Modal: focus-trapped, ESC-dismissible, `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`, return focus to invoker on close.
- "View securely" control: accessible name, visible focus state, semantic Button.
- Semantic design tokens only; no arbitrary colour classes.
- Justification: `/accessibility` policy commitment + service-provider reasonable-adjustments duty (Equality Act 2010 s.20/29).

## Legal-copy locale rule

The recipient-becomes-controller modal is quasi-legal. Per the legal-pages English-only policy: **do not auto-translate to IT/FR**. Phases 3 and 6 updated to:

- Render English copy only, regardless of UI locale, with a short localisable lead-in ("This notice is shown in English for legal accuracy").
- Flag for solicitor review before any future localisation.

---

## Phase 0 — Migration (first)

- Confirm/extend `transcript_shares` with `expires_at` (2-day TTL), `email_in_body` boolean, `attestation_consent_event_id` FK.
- New table `transcript_share_views` (audit per view): share_id, recipient_email_hash (HMAC), viewed_at, ip_country, user_agent_class. Reference its retention rule in `retention_config` (e.g. 180 days).
- New `consent_versions` rows: `share_uploader_attestation@v2026-06-v1`, `recipient_controller_notice@v2026-06-v1` (English only).
- RLS: views table service-role write, sender read-only for own shares.

## Phase 1 — Link-only by default + gated viewer (critical)

- `share-transcript` no longer embeds transcript content in email body by default. Email contains: sender display name, one-line context, **secure link only**, 2-day expiry notice, objection link.
- `SharedView.tsx` (gated):
  - If recipient is signed in and email matches `transcript_shares.recipient_email` → grant.
  - Else → email OTP via `request-share-otp` / `verify-share-otp`.
  - **OTP session**: on successful verify, mint a short-lived signed view session (HttpOnly cookie or signed token) valid for the **remaining share TTL** (≤ 2 days), scoped to that `share_id` + recipient email. No re-prompt per page load. Revoked on share expiry/revocation.
- LIA document committed under `docs/lia/share-recipient-email.md` as part of this phase.

## Phase 2 — Optional "include in email body" with attestation

- ShareButton: default link-only. **Progressive disclosure**: "include transcript in email body" toggle (default off). Only when toggled on does the inline per-share attestation checkbox appear (default unchecked), confirming sender has lawful basis / recipient expectation to receive the content directly.
- On submit with toggle on: write a `consent_events` row referencing `share_uploader_attestation@v2026-06-v1` with `share_id` context; store id on the share row.
- Default link-only path: zero added friction (no checkbox, no extra clicks).

## Phase 3 — Recipient-becomes-controller notice

- On first successful view (account match or OTP verified), show one-time modal with English-only Art. 14 notice and objection/erasure link.
- **Non-account recipients**: acknowledgement keyed to `share_token + recipient_email_hash`. Storage key: `whatsaid.share.controllerAck:{shareTokenShort}:{emailHashShort}` in localStorage, plus a server-side `consent_events` row (`recipient_controller_notice@v2026-06-v1`) so we have a durable record and the modal neither nags every view nor silently fails.
- **Account recipients**: keyed to `user_id + share_id` via `consent_events`.
- Accessibility criteria above apply.

## Phase 4 — Email hygiene (transparency/fairness, not PECR)

- From: `"<Sender Name> via WhatSaid" <notify@…>`; Reply-To: sender's address (when sender consents) or a no-reply with link to objection endpoint.
- Subject avoids implying WhatSaid authorship of the content.
- Justified on Art. 5(1)(a) — not reg. 22.

## Phase 5 — Public objection / erasure endpoint

- `/share/object?token=…` page lets any recipient (no login) submit an objection / erasure request tied to the share token; triggers immediate revocation of that share + queues sender notice.
- Link surfaced in every share email and on SharedView.
- Also linked from **`/settings → Your data`** (DataRightsCard) so account-holding recipients can manage shares they've received as well as those they've sent.

## Phase 6 — Policy updates

- `Privacy.tsx`: add "Sharing transcripts" section covering the two lawful bases, recipient-as-controller transition, retention (2-day share TTL, 180-day view audit), objection route.
- `Terms.tsx`: redistribution responsibilities for senders; attestation reference for email-body shares.
- Legal copy English-only; no IT/FR translations of the new sharing legal text (consistent with existing English-only policy). Flag for solicitor pass before any localisation.

## Cross-cutting acceptance

- 2-day share/PDF TTL enforced in DB (`expires_at`) and in `cleanup-expired-shares`; surfaced in email and SharedView.
- Per-view audit rows written to `transcript_share_views` with retention governed by `retention_config`.
- No transcript content leaves the server except over the gated viewer or signed short-lived PDF URL.
- WCAG 2.1 AA verified on SharedView, OTP, modal.
- LIA committed in repo before Phase 1 ships.

## Out of scope

- Group sharing, public links, share analytics dashboards, IT/FR legal translations.
