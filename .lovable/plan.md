# Fix: Record-now conversion broken by `record-tos-acceptance` boot failure

## Root cause

`supabase/functions/record-tos-acceptance/index.ts` declares `const jsonHeaders` twice in a row (lines 10 and 11). Deno refuses to boot the worker:

```
Uncaught SyntaxError: Identifier 'jsonHeaders' has already been declared
```

Every request to `record-tos-acceptance` therefore returns **503** on the CORS preflight, which is exactly what the browser console shows.

## Why `create-job` also fails with 401

`Convert.tsx` calls `record-tos-acceptance` (either up-front via `useTosConsent`, or as the automatic retry after `create-job` returns `409 attestation_required`). When the ToS call 503s:

- The consent row is never recorded.
- `create-job` is then invoked, but because the failed retry path short-circuits before a fresh JWT/refresh cycle completes, the preflight is rejected as **401**.

So the 401s on `create-job` are a downstream symptom, not a separate bug. Once `record-tos-acceptance` boots again, the existing 409→record→retry flow in `Convert.tsx` will succeed.

The trailing `400` on `/jobs` is the client falling back to a direct insert path after the edge call fails, which is correctly blocked by the `lock_jobs_billing_columns` trigger / RLS — expected behaviour, no change needed.

## Fix

Single-line edit in `supabase/functions/record-tos-acceptance/index.ts`: remove the duplicate `const jsonHeaders = ...` declaration so only one remains.

Then redeploy `record-tos-acceptance` so the boot error clears.

## Verification

1. `supabase--deploy_edge_functions` for `record-tos-acceptance`.
2. `supabase--edge_function_logs` to confirm a clean `booted` line with no `BootFailure`.
3. `supabase--curl_edge_functions` OPTIONS preflight → expect `200`, not `503`.
4. Ask the user to retry "Record now" → Convert; the 409 auto-retry path in `Convert.tsx` should now record consent and create the job.

## Files touched

- `supabase/functions/record-tos-acceptance/index.ts` — delete the duplicate `const jsonHeaders` line.

No client, schema, or config changes required.
