# WhatSaid — Spend guardrails (revised, with "How it is now" + Cloud usage findings)

## Problems to solve

1. Billing fields on `jobs` (`credits_charged`, `duration_seconds`, `file_size_bytes`, `temp_file_path`) are client-trusted.
2. `process-job` does not recompute credits or validate the storage object before calling AssemblyAI.
3. Most AI/share actions have no durable quota — `suggest-speakers` does not even require auth.
4. No usage ledger to spot runaway spend.
5. Cron / Cloud-usage waste from low-traffic period (see §B).

---

## A. Spend-guardrail changes

### A1. Shared pricing module on the server
- **Now:** constants live in `src/lib/pricing.ts` only. Edge functions have no equivalents and trust the row.
- **Change:** add `supabase/functions/_shared/pricing.ts` with `MINUTES_PER_CREDIT=120`, `MAX_DURATION=480*60`, `MAX_FILE_SIZE=100*1024*1024`, `MAX_CREDITS_PER_FILE=4`, and `creditsForDuration()`.

### A2. Server-authoritative job creation
- **Now:** `Convert.tsx` and `DirectRecorder.tsx` insert directly into `jobs` over RLS. They send `duration_seconds`, `credits_charged`, `file_size_bytes`, `temp_file_path` — fully client-controlled.
- **Change:** new edge function `create-job` (auth required). Validates `0 < duration ≤ 480 min`, `size ≤ 100 MB`, ext in `.m4a/.mp3/.wav`; recomputes `credits_charged = creditsForDuration(duration)`; assigns canonical `temp_file_path = ${user_id}/${job_id}.${ext}`; returns `{ job_id, upload_path, signed_upload_url }`. Client uploads only to that path. Direct insert is no longer used.

### A3. Lock billing fields after creation (DB trigger)
- **Now:** RLS policy `Users can update own jobs` allows updates to **any** column, including `credits_charged`, `duration_seconds`, `file_size_bytes`, `temp_file_path`, `user_id`, `guest_token`. No trigger guards them.
- **Change:** BEFORE UPDATE trigger on `public.jobs` that rejects changes to those six columns unless `auth.role() = 'service_role'`. User-editable columns (`title`, `speaker_names`, `language_selected`, `output_language`, etc.) continue to work.

### A4. Harden `process-job`
- **Now:** reads `credits_charged` from the row and calls `deduct_credits` with no re-validation; no check that the storage object exists, sits under the user's prefix, or matches `file_size_bytes`.
- **Change:** before charging, recompute expected credits from `duration_seconds`, re-enforce 480 min / 100 MB ceilings, and `storage.from('temp-audio').list(${user_id}/, …)` to confirm the object exists with size within ±5 %. On mismatch → mark `failed`, do not deduct, return.

### A5. Durable AI/action quotas — corrected scoping
- **Now per action:**
  | Action | Auth? | Quota today |
  |---|---|---|
  | `suggest-speakers` | **none** (no `requireAuth`) | none |
  | `generate-tags` | yes | none |
  | `translate-tags` | yes | none beyond auth |
  | `translate-all` (in `regenerate`) | yes | none |
  | summary regen (`regenerate` summary_from_edit) | yes | 3 lifetime / job via `jobs.summary_regen_count` |
  | Q&A / custom (`regenerate` question_generation) | yes | 10 lifetime / job via `jobs.question_generation_count` |
  | `share-transcript` | yes | none |

- **Why per-user + per-job (and not per-(user, job)/day as I had):** the previous draft scoped everything per-(user, job)/day, which lets one user with 100 jobs make 500 speaker-suggest calls/day. The actual cost driver is per user (and globally), with a per-job inner cap to prevent one job from burning the whole user quota.

- **Corrected limits, enforced via new `usage_events` ledger + `check_and_record_usage` RPC:**
  | Action | Per-user/day | Per-job cap | Notes |
  |---|---|---|---|
  | speaker-suggestions | 20 | 5/day | also add `requireAuth` |
  | generate-tags | 10 | 3/day | |
  | translate-all | 20 lang-jobs/day | 5 langs **lifetime** | translation is deterministic per (job, lang) — lifetime, not daily |
  | translate-tag | none | — | cache-first, cheap after first hit |
  | summary regen | — | 3 lifetime | migrate counter → ledger |
  | Q&A / custom | — | 10 lifetime | migrate counter → ledger |

### A6. Email / share caps in `share-transcript`
- **Now:** no caps at all.
- **Change:** before enqueue, enforce via `usage_events`: ≤ 20 share emails / user / day, ≤ 5 / job / day, ≤ 3 / recipient / job / day.

### A7. Owner PDF export dedupe
- **Now:** `share_pdf_cache` dedupes only shared PDFs (`(job_id, content_hash)`). Owner exports via `src/lib/export-pdf.ts` re-render and re-upload every click.
- **Change:** reuse `share_pdf_cache` keyed by `(user_id, job_id, content_hash, format)` for owner exports too.

### A8. `usage_events` ledger + observability
- **Now:** no centralized usage ledger; only ad-hoc `console.log`.
- **Change:** append-only `usage_events (user_id, job_id, action, provider, model, units_estimated, status, metadata, created_at)` + RLS (users SELECT own, service-role full) + `check_and_record_usage(action, scope, window, limit)` SECURITY DEFINER RPC (atomic count + insert in one tx). Every cost-sensitive edge function writes one row. Admin "Usage" tab shows daily rollups by user/action/provider and top spenders. Daily cron raises an admin notification if any user exceeds N minutes / M AI calls / K emails in 24 h.

---

## B. Lovable Cloud usage — current state & optimisations

I queried the live project. Findings (24 h window, low-traffic period — 22 visitors / 66 pageviews this week):

| Area | How it is now | Issue | Optimisation |
|---|---|---|---|
| `process-email-queue` cron | configured at **5 s**; `email_send_log` shows **0 rows in 24 h** | ~17 280 no-op invocations/day | Raise to **30 s** (still well within auth-email SLA, ~2 880 invocations/day → 83 % cut). Keep early-exit. |
| `cleanup-expired-shares` cron | hourly, 24 runs/24 h ✅ | none | keep |
| `cleanup_logs` table | **674 rows** — largest table in DB despite only 24 runs/day | rows from old cron history accumulate forever | TTL: delete rows older than 30 days inside the existing cleanup job |
| `tag_quality_flags` | 34 open flags | `scan-non-english-tags` is admin-triggered, not on a cron — fine | document cadence; no change |
| `async_jobs` | 45 total (4 failed, 41 completed), **0 queued/running** | completed rows never pruned | add TTL: delete completed rows > 30 days in cleanup job |
| `tags` | 194 rows for 12 users (~16/user) | OK | no change |
| `jobs` storage | only 17 jobs but `temp-audio` retention not verified end-to-end | risk of orphaned objects after failed `process-job` | `cleanup-stale-jobs` already exists — verify it removes storage objects for any job whose `audio_deleted_at` is null AND `created_at < now() - 1 h`; if not, add it |
| AssemblyAI cleanup | `assemblyai_delete_status` defaults to `pending` | rows may stay pending if `cleanup-assemblyai` fails silently | log + admin alert on > 1 h pending |
| Edge function `verify_jwt` | several admin/cleanup functions accept service role only via cron, but `suggest-speakers` accepts unauthenticated calls (no `requireAuth`) | abuse vector | tighten in §A5 |
| Title generation race | `generate-title` already has placeholder dedupe ✅ | none | keep |
| `share_pdf_cache` TTL | configured via `cleanup_config.share_pdf_cache_ttl_days` (30) ✅ | none | keep |

**Net effect of the cron + TTL changes**: drops scheduled invocations ~83 %, keeps `cleanup_logs` and `async_jobs` from growing unbounded, removes the unauthenticated AI endpoint.

---

## C. Tests (regression-safety) — mandatory gate

Nothing ships unless all of these are green.

**Vitest (existing + new):**
- Existing suite (`audio-creation-date`, `audio-enhance-large-file`, `export`, `languages`, `transcript`, `capabilities-doc`) stays green.
- New `pricing.shared.test.ts`: `creditsForDuration` parity between `src/lib/pricing.ts` and `_shared/pricing.ts` (snapshot constants).
- New `convert-uses-create-job.test.tsx`: `Convert.tsx` + `DirectRecorder.tsx` call `create-job` instead of `from('jobs').insert(...)`.

**Edge function (Deno) tests:**
- `create-job`: rejects size > 100 MB, duration > 480 min, duration ≤ 0, missing auth; recomputes credits independent of client input.
- `process-job`: rejects mismatched storage path, missing object, size/duration mismatch; does **not** deduct credits on rejection; happy-path still deducts exactly once.
- `check_and_record_usage` RPC: allows up to limit, blocks at limit+1, daily window resets at UTC midnight, per-job vs per-user scope isolation, two concurrent calls never over-allow.
- `share-transcript`: per-user (20/day), per-job (5/day), per-recipient (3/job/day) caps; under-limit sends succeed.
- `suggest-speakers`: unauthenticated request → 401 (regression guard).

**SQL trigger tests (migration smoke):**
- Authenticated UPDATE on `jobs.credits_charged | duration_seconds | file_size_bytes | temp_file_path | user_id | guest_token` **fails**.
- Authenticated UPDATE on `jobs.title | speaker_names | language_selected | output_language` **succeeds**.
- Service-role UPDATE on locked columns succeeds (so `process-job`, `transcribe`, `watchdog-stale-jobs` keep working).

**E2E smoke (manual checklist before merge):**
- Upload 30 s mp3 → job created via `create-job` → processed → 1 credit deducted exactly once.
- Direct recording 30 s → submit → 1 credit deducted, duration matches.
- Speaker-suggestions 6× in one job → 6th returns 429, UI shows friendly message.
- Share-transcript: 6th share to same job/day blocked; 4th to same recipient/job/day blocked.

**Regression checklist after deploy:**
- Paddle webhook still credits + admin signup/purchase emails still send (from last change).
- Auth email hook still sends signup/recovery through the queue.
- Watchdog still re-credits failed jobs (uses service role → trigger does not block).
- Guest flow removal still holds.

---

## Out of scope
Stripe/Paddle changes, guest billing, refactor of unrelated client counters.

## Deliverables
1. Migration: `usage_events` + RLS + indexes + `check_and_record_usage` RPC + `jobs` UPDATE trigger.
2. Edge functions: new `create-job`; updates to `process-job`, `share-transcript`, `generate-tags`, `suggest-speakers` (add auth), `regenerate`, `translate-tags`; extended `cleanup-stale-jobs` / `cleanup-expired-shares` for `cleanup_logs` + `async_jobs` TTL.
3. Cron change: `process-email-queue` 5 s → 30 s.
4. Shared: `supabase/functions/_shared/pricing.ts`.
5. Client: `Convert.tsx` + `DirectRecorder.tsx` switch to `create-job`; owner PDF export uses `share_pdf_cache`.
6. Admin "Usage" tab.
7. Tests above wired into CI.
8. `docs/ARCHITECTURE.md` updates (cron cadence, billing-field lock, usage ledger, TTLs).
