## Remaining phases (from the compliance analysis)

- **Phase 3 — DSR self-service** (Art. 15 access + Art. 16 rectification + Art. 20 portability export) ← *this plan*
- **Phase 4 — Cookie consent banner + cookie inventory** (PECR reg. 6 + UK GDPR Art. 7)
- **Phase 5 — Uploader lawful-basis attestation** (Art. 6/14 — user must declare they have the right to upload third-party voices)
- **Phase 6 — Share-recipient Art. 14 notice** (told-once notice when someone receives a shared transcript)
- **Phase 7 — Policy copy refresh** (Privacy Notice + Terms aligned with all of the above, solicitor pass)
- **Phase 8 — WCAG 2.2 AA statement + audit** (Equality Act 2010 reasonable adjustments)

---

# Phase 3 — DSR self-service (Access · Rectification · Portability)

## Why this next

UK GDPR Arts. 15, 16 and 20 give every data subject the right to **(a)** see what we hold, **(b)** correct it, and **(c)** receive it in a structured, commonly-used, machine-readable format. The ICO's enforcement guidance treats "no self-service" as an aggravating factor when SAR (subject access request) timelines (1 month, extendable to 3) are missed. WhatSaid today:

- **Access (Art. 15)** — **partial.** A user can see their own profile / jobs / credits inside the app, but there is no single "everything you hold on me" download. SARs would have to be handled manually over email with no audit trail.
- **Rectification (Art. 16)** — **partial.** `display_name`, `avatar_url`, `ui_language`, `preferred_voice`, `playback_speed` are editable from Settings. `email` is **not** user-editable; `country` is server-locked (correct — geo-immutable). There is no documented path to request correction of fields the user can't edit themselves.
- **Portability (Art. 20)** — **not implemented.** We have per-job export (TXT / JSON / PDF / DOCX) but no "give me a single ZIP of every job + transcript + summary + profile + consent history" bundle.
- **Erasure (Art. 17)** — already shipped (`delete-account` edge function), and Phase 2 extended it to anonymise (not hard-delete) `consent_events` rows. **No change in this phase.**
- **Audit** — no `dsr_requests` table; a regulator asking "how many SARs did you receive in the last 12 months and what was the median fulfilment time?" cannot be answered today.

## What changes

### 1. New `dsr_requests` table — audit trail

Every access / rectification / export request gets a row, regardless of whether the user self-serves or emails support. Lets us answer ICO timing questions and gives admins a queue for manual rectification asks.

| Column | Notes |
|---|---|
| `id`, `created_at` | standard |
| `user_id` | FK to auth user; nullable (deleted accounts → anonymised) |
| `kind` | `access` \| `rectification` \| `portability` \| `erasure` (erasure rows logged from `delete-account` for completeness) |
| `status` | `pending` \| `in_progress` \| `fulfilled` \| `rejected` |
| `requested_via` | `self_service` \| `support_email` |
| `fulfilled_at`, `fulfilled_by` | nullable; `fulfilled_by` is admin user_id for manual rows |
| `notes` | admin free-text (rectification details, rejection reason) |
| `export_storage_path` | nullable; path inside private `dsr-exports` bucket for portability ZIPs |
| `export_expires_at` | 7-day signed-URL window |

RLS: user reads own rows; admins read all; INSERT/UPDATE service-role only.

### 2. New private storage bucket `dsr-exports`

- Private, owner-scoped folder (`{user_id}/{request_id}.zip`).
- Files auto-expire after **7 days** (added to `retention_config` so Phase 2's `prune-retention` deletes them — no new cron).
- Download via signed URL only; never public.

### 3. New edge function `dsr-export` (Art. 15 + Art. 20 combined)

One function handles both because the data set is identical — Art. 20 just requires a portable format. Returns a ZIP containing:

```text
profile.json          — profiles row (excluding internal-only fields)
credits.json          — credit_balances + credit_transactions (UK tax evidence)
consent_history.json  — consent_events for this user (own rows only)
jobs/{job_id}/
  job.json            — jobs row (excluding system internals)
  transcript.txt
  transcript.json
  summary.txt
  custom_outputs.json — job_outputs + job_output_variants
  tags.json           — joined job_tags + tags
shares_sent.json      — transcript_shares where shared_by = user
usage_events.json     — usage_events for this user (last 90d, matches Phase 2 horizon)
notifications.json    — last 365d (matches Phase 2 horizon)
README.txt            — what each file contains, the export timestamp, retention rules, and contact for further requests
```

Auth: `requireAuth` + own-user only. Rate limit via the existing `check_and_record_usage` RPC: **2 exports per user per 24h, 12 per lifetime** (prevents ZIP-spam abuse while leaving genuine SARs unblocked). On success: writes a `dsr_requests` row with `kind='portability'`, `status='fulfilled'`, `requested_via='self_service'`, uploads ZIP, returns signed URL valid 7 days.

### 4. New edge function `dsr-rectification-request`

For fields the user can't edit themselves (today: `email`, `country`). User submits a short form (field, requested value, reason). Function:

- `requireAuth`.
- Validates field is in the allow-list (`email`, `country` only — anything else is rejected; we don't want a free-form "change anything" surface).
- Writes `dsr_requests` row with `kind='rectification'`, `status='pending'`.
- Sends the existing admin notification email (`admin-new-signup` template pattern) so the admin is paged.
- Returns 202 to user with the request ID and the statutory 1-month SLA.

No auto-application — `email` and `country` changes have security/fraud implications (account takeover via email change, GB-only enforcement via country lock) and need human review. The form's job is to **create a tracked, timed request**, not to mutate data.

### 5. Frontend — new "Your data" section in Settings

Under `src/pages/Settings.tsx`, a new card with three controls:

- **Download my data** → calls `dsr-export`; shows progress, then a signed-URL download link valid 7 days. Shows the rate-limit countdown if exhausted.
- **Request a correction** → opens a dialog wrapping `dsr-rectification-request`. Field dropdown limited to `email` / `country`. Reason textarea (min 10 chars). Confirms 1-month SLA in the success toast.
- **My data requests** → small table of the user's own `dsr_requests` rows (date, kind, status). Reuses existing `Table` shadcn component.

No new routes; everything lives under `/settings`. Mobile-first (works inside the 420px viewport already used elsewhere).

### 6. Admin — new "DSRs" tab

`src/components/admin/DsrTab.tsx`, added to `src/pages/Admin.tsx` between Usage and Retention. Lists all `dsr_requests` rows with filters (status, kind, date range, search by email/user_id). For `pending` rectification rows: an "Apply correction" sheet that performs the actual `email` / `country` UPDATE via a new RPC `admin_apply_rectification(p_request_id, p_new_value, p_note)` — service-definer, admin-gated, writes to `retention_config_audit`-style audit (will extend `dsr_requests` row in place with `fulfilled_at`/`fulfilled_by`/`notes`). Country changes go via `service_role` so the `lock_profile_country` trigger allows them.

### 7. Documentation

- `docs/PRIVACY-DSR.md` — single page documenting: which rights are self-service vs. assisted, the 1-month SLA, what the export ZIP contains, how to escalate to the ICO. Linked from `Privacy.tsx`.
- `docs/ARCHITECTURE.md` §5 — add `dsr_requests` table + `dsr-exports` bucket; §6 — add the two new edge functions; §10 — add the export storage line item (negligible cost, 7-day TTL).

### 8. Regression test gate

**Vitest** (`src/test/`)
- `dsr-export-payload.test.ts` — pure-function builder that assembles the ZIP manifest from in-memory fixtures; asserts every documented file is present and that no service-internal columns leak (e.g. `temp_file_path`, `assemblyai_transcript_id`).

**Deno edge tests**
- `dsr-export/dsr-export.test.ts` — anon rejected (401); authenticated user with one job gets a ZIP; rate limit (3rd call in <24h) returns 429; `dsr_requests` row written on success.
- `dsr-rectification-request/dsr-rectification-request.test.ts` — anon rejected; disallowed field (`display_name`) returns 400; valid request writes pending row and triggers admin email.

**Manual E2E checklist**
1. Self-service export → ZIP downloads, contains transcripts, signed URL expires after 7 days.
2. Rectification request for `email` → admin receives email, sees row in DSR tab, applies it; user's auth email actually updates.
3. Rate limit: 3 exports in a row → 3rd blocked with clear message.
4. Phase 2 `prune-retention` deletes expired `dsr-exports` ZIPs after 7 days (extend the existing dry-run check).
5. Deleted account: existing `delete-account` flow runs; verify `dsr_requests` rows for that user have `user_id` anonymised to NULL (same anonymisation rule as `consent_events`).
6. Confirm no regression in existing Settings page (avatar, display name, voice, language, password, delete account).

## Technical details

```text
Migration
─────────
CREATE TABLE public.dsr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                                   -- nullable for anonymisation
  kind text NOT NULL CHECK (kind IN ('access','rectification','portability','erasure')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','fulfilled','rejected')),
  requested_via text NOT NULL DEFAULT 'self_service'
    CHECK (requested_via IN ('self_service','support_email')),
  field text,                                     -- rectification only
  requested_value text,                           -- rectification only
  reason text,                                    -- user-supplied
  notes text,                                     -- admin-supplied
  export_storage_path text,                       -- portability only
  export_expires_at timestamptz,
  fulfilled_at timestamptz,
  fulfilled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dsr_requests TO authenticated;
GRANT ALL ON public.dsr_requests TO service_role;
ALTER TABLE public.dsr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own DSR rows" ON public.dsr_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all DSR rows" ON public.dsr_requests
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));
-- INSERT/UPDATE/DELETE: service_role only (no policy → denied for everyone else)

-- Anonymisation helper, called from delete-account
CREATE OR REPLACE FUNCTION private.anonymise_dsr_requests(_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.dsr_requests
     SET user_id = NULL, reason = NULL, requested_value = NULL
   WHERE user_id = _user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Admin rectification RPC (so email/country mutations are auditable)
CREATE OR REPLACE FUNCTION public.admin_apply_rectification(
  p_request_id uuid, p_new_value text, p_note text
) RETURNS public.dsr_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dsr_requests; v_uid uuid; v_field text;
BEGIN
  IF NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_row FROM public.dsr_requests WHERE id = p_request_id;
  IF v_row.kind <> 'rectification' OR v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not a pending rectification';
  END IF;
  v_uid := v_row.user_id; v_field := v_row.field;
  IF v_field = 'country' THEN
    UPDATE public.profiles SET country = upper(p_new_value) WHERE user_id = v_uid;
  ELSIF v_field = 'email' THEN
    -- profile email mirror only; auth.users.email update done from edge fn via admin API
    UPDATE public.profiles SET email = p_new_value WHERE user_id = v_uid;
  ELSE RAISE EXCEPTION 'unsupported field: %', v_field;
  END IF;
  UPDATE public.dsr_requests
    SET status='fulfilled', fulfilled_at=now(), fulfilled_by=auth.uid(),
        notes=COALESCE(notes||E'\n','')||p_note, updated_at=now()
    WHERE id = p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Add bucket to retention_config so Phase 2 sweeper expires ZIPs
INSERT INTO public.retention_config (dataset_key, retention_days, strategy, enabled, description, legal_basis)
VALUES ('dsr_exports', 7, 'delete', true, 'Signed-URL DSR portability ZIPs', 'Operational');

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('dsr-exports','dsr-exports', false);
CREATE POLICY "Users read own DSR exports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='dsr-exports' AND auth.uid()::text = (storage.foldername(name))[1]);

Edge functions
──────────────
supabase/functions/dsr-export/index.ts
  - requireAuth
  - check_and_record_usage(action='dsr_export', scope='user_day', window=1d, limit=2)
                          + scope='user_lifetime',           limit=12
  - assemble payload (pure builder, importable for vitest)
  - JSZip (esm.sh) → upload to dsr-exports/{user_id}/{request_id}.zip
  - create signed URL (7d)
  - insert dsr_requests row (kind='portability', status='fulfilled')
  - return { request_id, signed_url, expires_at }

supabase/functions/dsr-rectification-request/index.ts
  - requireAuth
  - zod-validate: field in {'email','country'}, value non-empty,
                  country is ISO-2, reason >= 10 chars
  - insert dsr_requests row (kind='rectification', status='pending')
  - enqueue admin email (existing transactional infra, new template
    admin-dsr-rectification.tsx in _shared/transactional-email-templates/)
  - return 202 { request_id, sla_days: 30 }

supabase/config.toml — both new functions: verify_jwt = true

delete-account update
  - In the same service-role transaction:
    PERFORM private.anonymise_dsr_requests(:uid);
```

## Out of scope (deferred to later phases)

- **Cookie consent banner** (Phase 4) — independent legal regime (PECR), separate UI.
- **Uploader lawful-basis attestation** (Phase 5) — upload-flow change, not a DSR.
- **Share-recipient Art. 14 notice** (Phase 6) — recipient-side, not subject-side.
- **Erasure (Art. 17)** — already shipped via `delete-account`; we only *log* erasures into `dsr_requests` for audit completeness, no behaviour change.
- **Restriction (Art. 18) and Objection (Art. 21)** — low practical demand for a paid B2C SaaS; if requested, handled manually via support email and logged in `dsr_requests` with `requested_via='support_email'`. Will revisit if volume warrants self-service.
- **Admin-side bulk export / CSV of DSR queue** — admin tab gives ad-hoc visibility; bulk reporting deferred until we have request volume.

## Deliverables

- 1 migration (`dsr_requests` table + RLS + `anonymise_dsr_requests` + `admin_apply_rectification` + storage bucket + retention row)
- 2 new edge functions (`dsr-export`, `dsr-rectification-request`) + Deno tests
- 1 new admin email template (`admin-dsr-rectification.tsx`)
- `delete-account` updated to call `anonymise_dsr_requests`
- `Settings.tsx` — new "Your data" card + dialogs
- `src/components/admin/DsrTab.tsx` + integration into `Admin.tsx`
- `src/lib/dsr-export-builder.ts` (pure, testable) + Vitest
- `docs/PRIVACY-DSR.md` (new) and `docs/ARCHITECTURE.md` updates

No new secrets required (uses existing `SUPABASE_SERVICE_ROLE_KEY` and the email infra already configured in Phase 1).
