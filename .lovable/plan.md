## Rip out upload-attestation modal — move consent to ToS

The migration row (`consent_versions` for `tos_uploader_warranty` v `2026-05-v1`) is already seeded. This plan covers all remaining code work in shipping order.

### 1. Legal copy
- `src/pages/Terms.tsx` — bump `EFFECTIVE_DATE` to "30 May 2026"; add clause `s19` under `s18` ("Your audio uploads"): Art 6 lawful-basis warranty, Art 14(5) duty-to-inform warranty, indemnity. Add EN/IT/FR strings.
- `src/pages/Privacy.tsx` — extend `#uploader-duties` section to name Lovable Cloud, Supabase, AssemblyAI as processors; state WhatSaid Ltd = controller for service operation, uploader = controller for recording content. EN/IT/FR.

### 2. Backend
- New `supabase/functions/record-tos-acceptance/index.ts` — authenticated POST. Resolves currently-effective `tos_uploader_warranty` version from `consent_versions`. Idempotently inserts `consent_events` row keyed on `(user_id, version)`. Returns `{ consent_id, version, created }`.
- Register in `supabase/config.toml`.
- `supabase/functions/create-job/index.ts` — remove 30-min `CONSENT_MAX_AGE_MS` window. New guard: select latest `consent_events` row where `user_id = auth.uid()` and `consent_type = 'tos_uploader_warranty'`; if none, return `409 attestation_required`. Pin its id to `jobs.upload_consent_id`. Drop `upload_consent_id` from request body schema. Keep immutability trigger + column intact.

### 3. Client
- `src/components/ui/checkbox.tsx` — base classes: `peer h-[18px] w-[18px] shrink-0 rounded-[4px] border-2 border-input ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors`. Inner `<Check>` → `h-3.5 w-3.5`.
- `src/contexts/AuthContext.tsx` — on `SIGNED_IN`, if no `consent_events` row for current effective `tos_uploader_warranty` version, fire `record-tos-acceptance` once per session (fail-soft).
- `src/pages/Signup.tsx` — update `signup.termsAgree` in EN/IT/FR to cover upload warranty. After successful `signUp`, invoke `record-tos-acceptance` (log-only on failure).
- `src/pages/Convert.tsx` — remove `UploadAttestationDialog` import + JSX, state (`attestationOpen`, `attestationLoading`, `pendingConvert`), handlers (`handleAttestationCancel`, `handleAttestationConfirm`), and the `if (!overrides?.uploadConsentId)` branch at L338-351 of `handleConvert`. Drop `upload_consent_id` from `create-job` body (L419). Keep inline `consentChecked` checkbox; update label to "I have the right to upload this recording." with `/privacy#uploader-duties` link. On `409 attestation_required`, call `record-tos-acceptance` then retry `create-job` once.
- i18n: update `convert.consentLabel` + add `convert.consentLabelLearnMore` ("Learn more") in EN/IT/FR.

### 4. Dead code removal
- Delete `src/components/UploadAttestationDialog.tsx`
- Delete `src/lib/upload-attestation-strings.ts`
- Delete `src/test/upload-attestation-strings.test.ts`
- Delete `supabase/functions/record-upload-attestation/` directory
- Remove its entry from `supabase/config.toml`
- Remove all `uploadAttestation.*` keys from EN/IT/FR locale files

### Guardrails (untouched)
Pricing, paddle-webhook, transcribe / process-job / post-process pipeline, `useJobHeartbeat`, credit ledger, jobs RLS, retention/cleanup. `consent_events` and `consent_versions` table shapes unchanged.

### Verification
1. Fresh signup → `consent_events` row exists for new user.
2. `/convert` upload: no modal; inline checkbox reads new label with working anchor link.
3. Convert with box ticked: upload starts; resulting job has `upload_consent_id` set.
4. Convert with box unticked: button disabled.
5. `/terms` shows new clause in EN/IT/FR.
6. `/privacy#uploader-duties` names sub-processors.
7. All checkboxes app-wide visibly square, distinct from radios.
8. Listed dead files no longer exist.
