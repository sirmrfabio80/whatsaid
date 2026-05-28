## Goal

When `prune-retention` finishes a run, decide whether it warrants an alert and, if so, email the admin via the existing transactional email pipeline. Also detect "missing runs" (no live run in >36h) from a tiny scheduled poke so we catch silent cron breakage.

This mirrors what the Retention Monitor admin tab already computes client-side, but moves the detection server-side so admins are notified without having to open the dashboard.

## Alert conditions

Inside each `prune-retention` invocation, after the `cleanup_logs` row is updated, classify the run:

1. `run_failed` — one or more datasets in `errors[]`, or the run status is `failed`.
2. `high_candidates` — any dataset report has `candidates > 10_000`. Likely indicates a pruning backlog or misconfigured horizon.
3. `large_processed_jump` — for live (non-dry-run) runs, any dataset's `processed` is >10× the median `processed` of the last 10 live runs for that dataset. Skipped for the first 10 runs to avoid noise during bootstrap.

Dry-run-only runs never trigger `large_processed_jump` (the metric is meaningless) but still trigger `run_failed` and `high_candidates`.

A separate `retention-monitor-watchdog` edge function (cron, every 6h) covers:

4. `missing_runs` — no `cleanup_logs` row for `prune-retention` or `prune-retention:dry-run` in the last 36 hours.

## Throttling

To prevent floods (e.g. a misconfigured cron firing hourly with errors), each alert kind is suppressed if an identical alert for the same dataset was already sent in the last 6 hours. Tracked in a small new table.

## Implementation steps

1. **Migration — `retention_alerts` audit/throttle table** with `alert_kind`, `dataset_key` (nullable, for run-level kinds), `cleanup_log_id`, `sent_at`, plus admin-only RLS and standard GRANTs. Index on `(alert_kind, dataset_key, sent_at desc)`.

2. **New email template** `admin-retention-alert.tsx` in `_shared/transactional-email-templates/`. Props: `alertKind`, `runId`, `mode` (live/dry-run), `datasets[]` (key + status + candidates + processed + error), `dashboardUrl`. Register in `registry.ts`.

3. **Shared helper** `supabase/functions/_shared/retention-alerts.ts` exporting `evaluateAlerts(report, history)` (pure, unit-testable) and `dispatchAlerts(admin, alerts, runId)` (writes throttle rows + invokes `send-transactional-email` with an idempotency key derived from `cleanup_log_id + alertKind + datasetKey`).

4. **Wire into `prune-retention/index.ts`** at the end of the run, after `cleanup_logs` is updated. Failures here are logged and never block the response.

5. **New edge function `retention-monitor-watchdog`** (verify_jwt true, service-role caller via cron). Queries last `cleanup_logs` row for `prune-retention*` and emits a `missing_runs` alert if older than 36h. Register in `supabase/config.toml`.

6. **Cron job** scheduled every 6h calling `retention-monitor-watchdog` with the service-role auth header (via Vault, same pattern as `process-email-queue`).

7. **Tests**:
   - `retention-alerts.test.ts` — pure unit tests for `evaluateAlerts` covering: clean run → no alert; failed dataset → `run_failed`; 12k candidates → `high_candidates`; 15× processed spike → `large_processed_jump`; dry-run + spike → no spike alert; thin history → no spike alert.
   - Smoke test for the watchdog (auth gate + missing-runs detection against a stub client).

## Technical notes

- Email send uses the existing `send-transactional-email` edge function — no direct Mailgun calls. Idempotency key prevents duplicate sends on retry.
- The throttle check is a single `select 1 from retention_alerts where … and sent_at > now() - interval '6 hours' limit 1` per candidate alert; the row is inserted before invoking the email, so a race during a cron storm still collapses to one send (the second insert wins or loses but only one email is queued).
- All new SQL follows the GRANT-then-RLS order; only admins read the table, service_role writes.
- No changes to the existing Retention Monitor UI in this plan — the surface there already reflects the same conditions and remains the canonical drill-down. We can add a "recent alerts" sub-card in a follow-up if desired.