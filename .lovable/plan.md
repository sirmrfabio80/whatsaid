
# Phase 5 — Uploader lawful-basis attestation (UK GDPR Art. 6 + Art. 14)

When a user uploads or records third-party voices, we currently process that personal data without recording any lawful basis from the uploader. UK GDPR makes the uploader the controller for that content; WhatSaid needs a per-job, auditable declaration that they have a lawful basis to upload and will handle Art. 14 notice to data subjects.

## Current state (audit)

| Concern | Today | Gap |
|---|---|---|
| Upload entry points | `src/components/AudioUploader.tsx` (drag/drop + picker) and `DirectRecorder.tsx`, both feed `Convert.tsx` | No attestation gate before upload |
| Existing privacy copy | One-liner inside `AudioUploader` (`audioUploader.securityNotice`) about deletion only | Doesn't cover third-party voices, consent, or Art. 14 |
| Reg. 37 dialog | `Reg37ConsentDialog` exists only for paid checkout | Pattern to reuse for per-action attestation |
| Job creation | `create-job` edge function inserts `jobs` row server-side | Cannot prove the uploader attested anything; no audit row |
| Consent infra | `consent_versions` + `consent_events` already exist (used by Reg. 37) | Reusable — just need a new `consent_type` value |
| Privacy policy | `src/pages/Privacy.tsx` | No "Your responsibilities when uploading others' voices" section |

## Goal

Before a transcription job is created, the uploader must:
1. Confirm they have a lawful basis (consent, contract, legitimate interest, or own voice only).
2. Acknowledge their Art. 14 duty to inform identifiable speakers where required.

The attestation is recorded once per job, linked to the job row, and replayable for audit. Closing the dialog cancels the upload.

## Deliverables

### 1. Consent version row

New seed in `consent_versions`:
- `consent_type = 'upload_lawful_basis'`, `version = '1.0.0'`
- EN/IT/FR copy stored verbatim so audits can reproduce what the user saw
- `text_hash` computed from EN text

Migration also adds nullable `jobs.upload_consent_id uuid` (no FK to keep deletes cheap; values are immutable via the existing `trg_jobs_lock_billing_columns` pattern extended to this column) and an index on `(user_id, created_at)` for the consents query.

### 2. Attestation dialog

`src/components/UploadAttestationDialog.tsx`, modelled on `Reg37ConsentDialog`:
- Two required checkboxes:
  - "I confirm I have a lawful basis to upload this audio (my own voice, the speakers' consent, a contract, or another lawful ground under UK GDPR Art. 6)."
  - "Where the recording contains identifiable people other than me, I will inform them their voice is being transcribed, unless an Art. 14(5) exemption applies."
- Optional radio with the chosen basis (`own_voice` | `consent` | `contract` | `legitimate_interest` | `legal_obligation` | `other`) so we can store it in `consent_events.metadata`. Default unselected — must pick one to continue.
- Optional free-text "Context (optional)" capped at 280 chars, stored in metadata. Useful for audits, never displayed publicly.
- Plain-language helper text explains we delete audio immediately after processing and link to `/privacy#uploader-duties`.
- ESC / outside click / Cancel = no consent recorded, no upload. Same `min-h-[44px]` touch targets and a11y as Reg. 37 dialog.
- Strings in `src/lib/upload-attestation-strings.ts` with EN/IT/FR and `pickLocale` resolution.

### 3. Wiring in Convert.tsx

Flow change in `src/pages/Convert.tsx` (single integration point — covers both `AudioUploader` and `DirectRecorder`):
1. User selects/records a file → metadata extracted as today.
2. Instead of going straight to upload, open `UploadAttestationDialog`.
3. On confirm:
   - Call new edge function `record-upload-attestation` → returns `consent_id`.
   - Proceed with existing upload + `create-job` flow, passing `consent_id` in the body.
4. On cancel: clear the staged file, no upload starts.

For re-runs of the same job (regenerate transcript, change language) the existing job already has a `consent_id` — no re-prompt.

### 4. Edge function: `record-upload-attestation`

New function under `supabase/functions/record-upload-attestation/`:
- Auth required (uses `requireAuth`).
- Body: `{ version, basis, contextNote?, acknowledgements: { lawfulBasis: true, art14Notice: true } }`.
- Validates both acknowledgements are `true`, basis is in the allowed enum, version matches the active row in `consent_versions`.
- Inserts into `consent_events` with `consent_type='upload_lawful_basis'`, `metadata={ basis, contextNote }`, `ip_hash`, `user_agent`.
- Rate limited via `enforceQuota` (e.g. 60/day, 1000/lifetime) to stop scripted abuse.
- Returns `{ consent_id }`.

### 5. `create-job` enforcement

Update `supabase/functions/create-job/index.ts` to:
- Require `upload_consent_id` in the request body.
- Verify the consent row exists, belongs to `auth.uid()`, is `consent_type='upload_lawful_basis'`, and was issued within the last 30 minutes (prevents replay of a stale token).
- Write the id onto `jobs.upload_consent_id`.
- Existing `trg_jobs_lock_billing_columns` trigger extended to also lock `upload_consent_id` post-insert.

If the consent check fails, the function returns `409 attestation_required` and the UI re-prompts.

### 6. Privacy & docs

- `src/pages/Privacy.tsx`: new "Your responsibilities when uploading others' voices" section in EN/IT/FR with the lawful-basis grounds, an Art. 14 summary, and a pointer to ICO guidance. Add anchor `#uploader-duties`.
- `docs/ARCHITECTURE.md` §Privacy: paragraph documenting the per-job attestation, the `consent_versions` row, and `jobs.upload_consent_id`.
- `WhatSaid-Architecture-Privacy-Dossier.md`: clear the "[MISSING] uploader lawful-basis declaration" flag.

### 7. Admin visibility

Extend `src/components/admin/JobAuditCard.tsx` to render the linked consent (version, basis, timestamp, optional context note). No new admin tab needed — DSR / audit workflows already open the job audit card.

## Regression / test gate

- Vitest `src/test/upload-attestation-strings.test.ts` — locale shape parity + presence of mandatory clauses (keyword grep on EN/IT/FR).
- Edge tests:
  - `record-upload-attestation/index.test.ts` — rejects missing acknowledgements, rejects unknown basis, rejects stale version, succeeds on valid input.
  - `create-job/create-job.test.ts` — extend with cases: missing `upload_consent_id` → 409, foreign-user consent → 403, stale consent (>30 min) → 409, happy path writes id.
- SQL smoke: after migration, `INSERT` into `jobs` without `upload_consent_id` from a non-service role still succeeds (column nullable for back-compat reads) but `UPDATE` attempt to change `upload_consent_id` post-insert is rejected by the trigger.
- Manual checklist:
  - Drag/drop upload prompts the dialog before bytes leave the browser.
  - DirectRecorder finalisation also prompts the dialog.
  - Cancel discards the staged file and shows no toast spam.
  - Re-running an existing job (regenerate) does NOT re-prompt.
  - Dialog passes keyboard nav, ≥4.5:1 contrast in light + dark, mobile bottom-sheet layout at ≤640px.
  - Localised copy renders in EN/IT/FR with no missing-key warnings.

## Out of scope

- Per-speaker takedown workflow (covered by existing DSR rectification path).
- Storing the attestation against guest jobs (guest flow already removed — only authenticated users upload).
- Email confirmation of the attestation to the uploader (the audit row + DSR export already cover this).
