# Transcript Sharing — Remediation Plan v3

Scope: sharing only. Phase order preserved (Phase 0 migration → Phase 1 link-only + gated viewer first). This revision reconciles the plan with subsystems that already ship today, fixes a key-format mismatch, and closes one legal gap.

## What already ships today (verified against repo)

Build on these — do **not** parallel them:

- **`share-transcript`** currently embeds full transcript + summary + Q&A in the email body (`buildEmailHtml`/`buildPlainText`). This is the security problem Phase 1 fixes.
- **`transcript_shares`** exists with `expires_at` defaulted to `now() + interval '2 days'` **in the DB** (not just copy), plus indexes on `job_id` and `(shared_by, created_at)`.
- **`consent_events` + `consent_versions`** exist. Version key convention is **dot-separated**: `share_recipient_notice.2026-05-v1`. `consent_events.version` FKs into `consent_versions.version`, so format must match.
- **Art. 14 recipient notice already exists**, seeded as `share_recipient_notice.2026-05-v1`, covering controller identity, processor role, lawful basis, recipients, retention, rights, ICO complaint, and an objection paragraph.
- **`_shared/recipient-notice.ts`** provides `resolveActiveNotice`, `buildNoticeHtml`, `buildNoticeText`, `effective_from/to` handling, with unit tests in `_shared/recipient-notice.test.ts`. Already injected into share emails.
- **`recipient_notifications`** table (`job_id`, `shared_by`, `recipient_email_hash`, `channel`, `notice_type`, `notice_version`, `message_id`, RLS for uploader + admin) — this is the per-recipient audit store. Extend it; do not create a parallel one.
- **`/privacy/share-notice`** full-notice page already referenced from emails.
- **`ClaimShare.tsx`** is the "claim into account" path → `claim-transcript-share` → `/job/:id`. There is **no read-only viewer today**.
- **Email From/Reply-To**: From is `WhatSaid <noreply@…>`; Reply-To is **already** `senderEmail` unconditionally.
- **Token-based no-login endpoints already exist**: `handle-email-unsubscribe`, `handle-email-suppression`. Reuse this pattern for objection.
- **No Art. 28 / processor-terms artifact exists in repo.** The notice asserts WhatSaid is a processor; Terms does not back this up.

## Lawful basis (precise, with caveat)

- **Sender's transcript processing** — Art. 6(1)(b) UK GDPR: necessary to perform the service contracted for, including the share feature.
- **Recipient email-address processing (deliver the share)** — Art. 6(1)(f) + documented **LIA** committed at `docs/lia/share-recipient-email.md` **before Phase 1 ships**. LIA covers purpose, necessity (minimal: email only, single transactional message, no marketing), balance (Art. 14 notice on first view, short retention, easy objection).
- **Special-category content (Art. 9) — corrected**: WhatSaid acts as **processor**, so does not need its own separate Art. 9(2) condition. But the **sender (controller)** must hold an Art. 9(2) limb (and, where applicable, a DPA Sch.1 paragraph + Appropriate Policy Document) **scoped to onward disclosure to the recipient**, not just the original transcription. This is captured operationally by widening the Phase 2 attestation copy to cover Art. 9 / onward-sharing scope. The processor characterisation itself goes to solicitor (see Phase 6).
- **Art. 32** security bar (encryption in transit, gated access, short TTL, audit) — unchanged.

## PECR position

A user-initiated 1:1 share is **not direct marketing**; PECR reg. 22 is out of scope. Phase 4 From-display-name change is justified on **Art. 5(1)(a) transparency/fairness** — avoiding mischaracterisation as WhatSaid-authored content.

## Accessibility (WCAG 2.1 AA) — applies to all new/changed UI

SharedView, OTP input, controller-notice modal:
- Labelled OTP field (`<label>` + `aria-describedby`), `inputmode="numeric"`, `autocomplete="one-time-code"`.
- Modal: focus-trapped, ESC-dismissible, `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`, focus returned to invoker on close.
- "View securely" control: accessible name, visible focus, semantic Button.
- Semantic design tokens only.
- Justification: `/accessibility` policy + Equality Act 2010 s.20/29.

## Legal-copy locale

Quasi-legal copy stays English-only per existing policy. Short localisable lead-in: *"This notice is shown in English for legal accuracy."* Flag for solicitor pass before any future localisation.

---

## Phase 0 — Migration (first)

- Extend `transcript_shares` with `email_in_body` boolean (default false), `attestation_consent_event_id` FK to `consent_events(id)`. **Keep** the existing DB-level `expires_at` 2-day default.
- **Per-view audit** uses the existing `recipient_notifications` table by adding new `channel` values (`in_app_modal`, `view`). Rationale: same shape (job_id, shared_by, recipient_email_hash, notice_type/version, message_id). **Do not** add a parallel `transcript_share_views` table. Document this decision in the migration.
- Add **one** new consent version row, dot-formatted to match existing FK convention: `share_uploader_attestation.2026-06-v1` (English only). **Do not** mint a second `recipient_controller_notice` type — reuse the existing `share_recipient_notice.2026-05-v1`.
- RLS unchanged: service-role writes audit rows; uploader read-only for own.

## Phase 1 — Link-only by default + gated viewer (critical)

- `share-transcript` no longer embeds transcript content in the email body by default. Email contains: sender display name, one-line context, **secure link only**, 2-day expiry notice, objection link (from the existing notice).
- **New `SharedView.tsx`** = read-only gated viewer; default landing for `/share/:token`. Reconciliation with existing `ClaimShare.tsx`:
  - `SharedView` is the **default** landing for the share link.
  - "Claim into my account" is an **optional upgrade** from `SharedView` that routes to existing `ClaimShare.tsx` → `claim-transcript-share` → `/job/:id`. No rename, no deletion.
- Gating logic in `SharedView`:
  - Signed in and email matches `transcript_shares.recipient_email` → grant.
  - Else → email OTP via new `request-share-otp` / `verify-share-otp` edge functions.
  - On verify, mint a short-lived signed view session (HttpOnly cookie or signed token) valid for the **remaining share TTL** (≤ 2 days), scoped to `share_id + recipient_email`. No re-prompt per page load. Revoked on share expiry/revocation.
- **LIA** committed at `docs/lia/share-recipient-email.md` as part of this phase.

## Phase 2 — Optional "include in email body" with widened attestation

- ShareButton: default link-only. Progressive disclosure: "include transcript in email body" toggle (default off). Only when toggled does the per-share attestation checkbox appear (default unchecked).
- Attestation copy **widened** to capture **Art. 9 / onward-sharing scope** (not just generic "lawful basis / recipient expectation"). Sender confirms they hold the necessary basis for onward disclosure of the document's content — including any special-category content — to the named recipient.
- On submit with toggle on: write a `consent_events` row referencing `share_uploader_attestation.2026-06-v1` with `share_id` context; store the id on `transcript_shares.attestation_consent_event_id`.
- Default link-only path: zero added friction.

## Phase 3 — Recipient-becomes-controller notice (reuse existing subsystem)

- On first successful view (account match or OTP verified), show a one-time modal that renders the **existing** `share_recipient_notice.2026-05-v1` copy via `resolveActiveNotice` (or a small client-side equivalent fed by the edge function). **Do not** create a new consent type.
- Record the acknowledgement by inserting into **existing** `recipient_notifications` with `channel='in_app_modal'`, `notice_type='share_recipient_notice'`, `notice_version='share_recipient_notice.2026-05-v1'`.
- De-dupe via existing unique constraint on `(job_id, recipient_email_hash, channel, notice_version)` so the modal does not re-prompt.
- Per-view audit (distinct from notice-sent): insert with `channel='view'` on each successful gated view.
- Accessibility criteria above apply.

## Phase 4 — Email hygiene (transparency/fairness, not PECR)

- Change `From` display name to `"<Sender Name> via WhatSaid" <noreply@…>` to avoid implying WhatSaid authorship of the content.
- Reply-To-to-sender **already ships unconditionally** — treat as existing behaviour. Add a sender-side disclosure in the share UI that their email address will be exposed as Reply-To, with an opt-out that falls back to a no-reply Reply-To carrying a link to `/share/object`.
- Subject line reviewed to avoid implying WhatSaid authorship.

## Phase 5 — Public objection / erasure endpoint

- New `/share/object?token=…` page + edge function built on the **`handle-email-unsubscribe` token pattern** (no-login, single-use token, atomic check-and-update).
- Action: immediately revoke that share, purge `share_pdf_cache` for it, queue a sender notice.
- Slot the link into the **existing** notice's objection paragraph (in `_shared/recipient-notice.ts`) rather than adding a parallel objection mechanism. Also linked from `SharedView` and from `/settings → Your data` (`DataRightsCard`).

## Phase 6 — Policy updates + controller/processor keystone

- **`Terms.tsx`**: add a short processor-terms clause making the controller (sender) / processor (WhatSaid) split explicit, scoped to sharing. Cover instructions, confidentiality, security, sub-processors, breach assistance, deletion, audit cooperation — at the level appropriate for B2C terms.
- **`Privacy.tsx`**: link to (do not duplicate) the existing `/privacy/share-notice` page. Add a short "Sharing transcripts" subsection covering the two lawful bases, recipient-as-controller transition, retention (2-day share TTL, view-audit retention per `retention_config`), objection route.
- **Solicitor pass before Phase 1 ships** covers:
  1. The controller/processor characterisation itself (not just the wording) — the legal keystone.
  2. The widened Phase 2 attestation copy (Art. 9 scope).
  3. The Terms processor clause.
  English-only; no IT/FR translations of the new sharing legal text.

---

## Verification (acceptance per phase)

- **Email content**: trigger share → default email contains link only (no transcript/summary/Q&A) + 2-day expiry notice. Toggle "include in body" → confirm `consent_events` row with `share_uploader_attestation.2026-06-v1` written and FK'd from `transcript_shares.attestation_consent_event_id`.
- **Gated viewer**: open link signed-out → OTP; verify → short-lived session valid for remaining TTL; re-open after expiry → denied. Signed-in with matching email → no OTP.
- **Controller modal**: first view shows existing `share_recipient_notice` copy; `recipient_notifications` row written with `channel='in_app_modal'`; second view does not re-prompt; per-view `channel='view'` row written each time.
- **Objection**: `/share/object?token=…` revokes share + purges PDF cache + queues sender notice with no login. Link present in email, SharedView, DataRightsCard.
- **TTL/cleanup**: `cleanup-expired-shares` purges expired shares + associated `share_pdf_cache`.
- **A11y**: axe + keyboard pass on SharedView, OTP field, modal (focus trap, ESC, labelled OTP input).
- **Tests**: extend `_shared/recipient-notice.test.ts` with the new `channel` values and view-audit path. Run full suite.
- **Legal**: LIA committed at `docs/lia/share-recipient-email.md`; solicitor sign-off on controller/processor characterisation + Phase 2 attestation + Terms clause recorded **before Phase 1 ships**.

## Out of scope

Group sharing, public links, share analytics dashboards, IT/FR legal translations, broader Art. 28 DPA work beyond the sharing clause in Terms.
