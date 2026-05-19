## Phase 1 — Safe, immediate spend guardrails

Scope: shared pricing constants on the server, durable usage ledger + RPC, tighten auth on `suggest-speakers`, cut idle cron cost, prune log/job TTLs. **No client changes, no `jobs` trigger, no `create-job` yet** — those land in Phase 2.

### 1. Shared pricing module (server)
**Now:** constants live only in `src/lib/pricing.ts`; edge functions trust the row.
**Change:** add `supabase/functions/_shared/pricing.ts` exporting `MINUTES_PER_CREDIT=120`, `MAX_DURATION=480*60`, `MAX_FILE_SIZE=100*1024*1024`, `MAX_CREDITS_PER_FILE=4`, and `creditsForDuration()` — byte-for-byte parity with the client module. No call sites switch yet (Phase 2 wires them in); this just makes the constants importable.

### 2. `usage_events` ledger + `check_and_record_usage` RPC (migration)
**Now:** no central usage ledger; ad-hoc `console.log` only. Summary regen / Q&A use mutable counters on `jobs`.
**Change (migration):**
- Table `public.usage_events`:
  - `id uuid pk`, `user_id uuid not null`, `job_id uuid null`, `action text not null`, `scope text not null` (`user_day` | `job_day` | `job_lifetime` | `recipient_job_day`), `scope_key text null` (e.g. recipient email, lang code), `units int not null default 1`, `metadata jsonb null`, `created_at timestamptz not null default now()`
- Indexes: `(user_id, action, created_at desc)`, `(job_id, action, created_at desc)`, partial `(action, scope_key, created_at desc)` for recipient lookups.
- RLS: users `SELECT` own (`auth.uid() = user_id`); service role full access. No user `INSERT/UPDATE/DELETE` (writes only via RPC).
- RPC `check_and_record_usage(p_action text, p_scope text, p_job_id uuid, p_scope_key text, p_window interval, p_limit int, p_units int default 1) returns jsonb` — SECURITY DEFINER, `search_path = public`. Atomically: counts matching rows in window (or lifetime if `p_window is null`), if `count + p_units > p_limit` returns `{ allowed: false, used, limit }`, else inserts one row and returns `{ allowed: true, used: used+units, limit }`. Wrap in single transaction with `SELECT … FOR UPDATE` on a per-(user_id, action) lock row to prevent race-allow.

### 3. Tighten `suggest-speakers` auth
**Now:** function has no `requireAuth` and `supabase/config.toml` does not list it → unauthenticated callers reach the model.
**Change:** add `requireAuth(req.headers.get("Authorization"))` early-return in `supabase/functions/suggest-speakers/index.ts`. No config.toml change needed (default validates JWT in code).

### 4. `process-email-queue` cron 5 s → 30 s
**Now:** cron runs every 5 s; `email_send_log` shows 0 rows / 24 h in current period → ~17 280 no-op invocations/day.
**Change:** update the existing pg_cron schedule for `process-email-queue` from `*/5 * * * * *` to `*/30 * * * * *` (one ALTER via migration, in `cron.schedule` re-register). Function code unchanged — its early-exit on empty queue keeps the new cadence well within auth-email SLA. Expected reduction: ~83 %.

### 5. TTL prune for `cleanup_logs` and completed `async_jobs`
**Now:** `cleanup_logs` has 674 rows (largest table) and `async_jobs` has 41 completed rows never pruned.
**Change:** extend the existing `cleanup-expired-shares` edge function to also:
- `DELETE FROM cleanup_logs WHERE created_at < now() - interval '30 days'`
- `DELETE FROM async_jobs WHERE status IN ('completed','failed') AND updated_at < now() - interval '30 days'`
Both counts logged into the new cleanup-log row's `metadata`. No new cron — piggybacks on the existing hourly run.

### 6. Tests (mandatory gate — nothing ships unless green)
**Vitest:**
- New `src/test/pricing.shared.test.ts`: snapshot equality of `MINUTES_PER_CREDIT`, `MAX_DURATION`, `MAX_FILE_SIZE`, `MAX_CREDITS_PER_FILE`, and 6 `creditsForDuration` cases between `src/lib/pricing.ts` and the new shared module (loaded as plain TS).
- Existing suite (`audio-creation-date`, `audio-enhance-large-file`, `export`, `languages`, `transcript`, `capabilities-doc`) stays green — no source files outside the new ones are touched in Phase 1, so this is a pure regression guard.

**Deno edge tests (`supabase--test_edge_functions`):**
- `suggest-speakers/suggest-speakers.test.ts` (new): unauthenticated POST → 401; missing Authorization header → 401.
- `_shared/usage-rpc.test.ts` (new): call the RPC via service-role client against the live test DB —
  - allows up to `limit`, blocks at `limit + 1`
  - `user_day` window resets after backdating a row
  - `job_lifetime` (null window) accumulates across days
  - per-job and per-user scope counts don't bleed into each other
  - two concurrent calls at limit-1 produce exactly one allow + one deny (race guard)

**SQL smoke (inside migration):** `DO $$ … assert $$` blocks verify RPC exists, RLS denies anon SELECT, service role can insert.

**Post-deploy manual checklist:**
- Auth signup still receives email (auth-email-hook + queue at 30 s cadence)
- Paddle webhook still credits (no code change, but observe one purchase)
- `cleanup-expired-shares` next run logs `cleanup_logs_deleted` + `async_jobs_deleted` counts

### Deliverables
1. Migration: `usage_events` table + RLS + indexes + `check_and_record_usage` RPC + `cron.schedule` update for `process-email-queue` (5 s → 30 s).
2. New file: `supabase/functions/_shared/pricing.ts`.
3. Edit: `supabase/functions/suggest-speakers/index.ts` (add `requireAuth`).
4. Edit: `supabase/functions/cleanup-expired-shares/index.ts` (TTL prune for `cleanup_logs` + `async_jobs`).
5. Tests: `src/test/pricing.shared.test.ts`, `supabase/functions/suggest-speakers/suggest-speakers.test.ts`, `supabase/functions/_shared/usage-rpc.test.ts`.

### Explicitly NOT in Phase 1
- `jobs` UPDATE trigger locking billing columns
- `create-job` edge function
- Client switch in `Convert.tsx` / `DirectRecorder.tsx`
- Wiring quotas into `generate-tags`, `regenerate`, `translate-tags`, `share-transcript`
- Owner PDF dedupe, admin Usage tab

All of the above land in Phase 2 once Phase 1 has soaked for 24–48 h with no regressions.
