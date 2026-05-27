# Plan — Admin retention config editor with audit log

## Context / how it is now
- Phase 2 proposed a `retention_config` table and `prune-retention` edge function, but **neither has been implemented yet**. The DB currently has no `retention_config` and no retention-related tables.
- `docs/RETENTION.md` does not exist.
- Admin UI exists at `src/pages/Admin.tsx` with a `Usage` tab (`src/components/admin/UsageTab.tsx`). There is no Retention tab.
- Admin-only RLS pattern already in use elsewhere: `private.has_role(auth.uid(), 'admin'::app_role)`.

Because the table does not exist, this plan creates the minimal schema needed to support the admin editor, plus the editor itself. It deliberately stops short of writing the `prune-retention` sweeper — that remains Phase 2b and is out of scope here.

## Goals
1. Persist admin-tunable retention horizons in a typed table.
2. Let admins view and edit those horizons from the Admin page.
3. Record every change (who, when, before → after, optional reason) in an immutable audit log visible to admins.

## Non-goals
- No automated pruning / cron sweeper (separate follow-up).
- No bulk import or per-row schedule overrides.
- No i18n of admin UI strings (EN only, matches existing admin tabs).

## Database changes (single migration)

### `public.retention_config`
One row per managed dataset.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `dataset_key` | text unique not null | e.g. `consent_events`, `email_send_log`, `usage_events`, `cleanup_logs`, `async_jobs_finished` |
| `description` | text | human-readable purpose |
| `legal_basis` | text | e.g. `contract_6y`, `legitimate_interest_90d` |
| `retention_days` | integer not null check (>= 0 and <= 365*10) | 0 = disabled |
| `strategy` | text not null check in (`delete`, `anonymize`) | how the sweeper should handle it |
| `enabled` | boolean not null default true | sweeper skips when false |
| `updated_by` | uuid | last admin |
| `updated_at` | timestamptz default now() |
| `created_at` | timestamptz default now() |

Grants: `SELECT, UPDATE` to `authenticated` (admins gated by RLS), `ALL` to `service_role`. No `INSERT/DELETE` to authenticated — rows are seeded by migration only, so the admin UI is edit-only.

RLS:
- `SELECT` / `UPDATE` → `private.has_role(auth.uid(), 'admin')`.
- Service role full access via existing pattern.

Seed defaults (matches retention discussion):
- `consent_events` — 2190 days (6y) — `anonymize`
- `credit_transactions` — 2190 days — `delete` disabled by default (contractual; flagged disabled so admin must explicitly opt in)
- `email_send_log` — 180 days — `delete`
- `usage_events` — 90 days — `delete`
- `cleanup_logs` — 30 days — `delete`
- `async_jobs_finished` — 30 days — `delete`

### `public.retention_config_audit`
Append-only.

| column | type | notes |
|---|---|---|
| `id` | uuid pk |
| `dataset_key` | text not null |
| `changed_by` | uuid not null |
| `changed_at` | timestamptz default now() |
| `before` | jsonb not null | snapshot of mutable fields |
| `after` | jsonb not null |
| `reason` | text | optional admin note |

Grants: `SELECT` to `authenticated` (admin-only via RLS), `ALL` to `service_role`. No client `INSERT/UPDATE/DELETE`.
RLS: admin SELECT only.

### Trigger `trg_retention_config_audit`
`AFTER UPDATE ON public.retention_config FOR EACH ROW` → inserts a row in `retention_config_audit` capturing `before`/`after` JSON of `{retention_days, strategy, enabled, description, legal_basis}` plus `changed_by = auth.uid()`. Skips when nothing in the tracked set changed. The `reason` is read from `current_setting('app.retention_change_reason', true)` so the edge function can set it per-request; null when absent.

Also guards immutability: raises if `dataset_key` is changed.

## Edge function: `update-retention-config`
Small, auth-gated wrapper so we can attach `reason` to the audit row and centralise validation.

- `POST { dataset_key, retention_days, strategy, enabled, description?, legal_basis?, reason? }`
- `requireAuth` + admin check via `has_role` RPC (service-role client, like other admin functions).
- Validates with Zod: `retention_days` 0–3650, `strategy in ['delete','anonymize']`.
- Sets `app.retention_change_reason` via `select set_config(...)` then performs the `UPDATE` as service role; trigger writes the audit row.
- Returns updated row.

This keeps the client off direct table updates and gives us one place to enforce admin + validation.

## Frontend

### New tab in `src/pages/Admin.tsx`
Add a `Retention` tab between `Usage` and `Others`.

### New component `src/components/admin/RetentionTab.tsx`
- Loads `retention_config` ordered by `dataset_key`.
- Table with columns: dataset, description, legal basis, retention (days), strategy, enabled, last updated.
- Inline edit per row via a `Sheet` (or `Dialog`) containing:
  - `retention_days` numeric input
  - `strategy` select (`delete` / `anonymize`)
  - `enabled` switch
  - editable `description`, `legal_basis`
  - required `reason` textarea (min 5 chars) for the audit trail
  - Save → calls `supabase.functions.invoke('update-retention-config', ...)`, toasts result, refetches.
- Below the table, a collapsible "Change history" section listing the latest 50 `retention_config_audit` rows: timestamp, admin (resolve via `profiles.display_name` join on `changed_by`), dataset, diff summary (`retention_days: 90 → 60`, etc.), reason.
- Mobile-friendly: table collapses to stacked cards under `md`.
- Uses existing shadcn primitives already imported by other admin tabs; no new deps.

### Copy
Tab label: **Retention**. Subheading: "Configure how long each dataset is retained. Changes are audited."

## Regression / testing
- Migration includes a self-test transaction: insert seed rows, perform one update, assert one row appears in audit, then `ROLLBACK` (kept in a comment in the migration file for manual verification only; not executed).
- Manual checklist after implementation:
  1. As non-admin authenticated user, `select * from retention_config` → 0 rows (RLS).
  2. As admin in UI, edit `usage_events` to 60 days with reason "tighter cost control" → row updates, audit row appears with correct before/after and reason.
  3. As admin, attempt empty reason → client blocks; attempt with `retention_days = -1` → edge function 400.
  4. Try to change `dataset_key` via the API → trigger raises.
- Confirm existing Vitest suite still passes (no business-logic file changes outside the new tab).

## Out of scope (tracked for later)
- `prune-retention` edge function and cron schedule.
- `docs/RETENTION.md` source-of-truth doc.
- Admin "Run prune now" button and dry-run preview.

These will land in Phase 2b once the table and editor are in place and reviewed.
