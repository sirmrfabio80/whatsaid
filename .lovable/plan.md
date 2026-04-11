

# Bug Fix Plan: Session Stability, Navigation, and Summary Language

## Root Causes Confirmed

1. **Bug 1 (Post-processing navigation)**: `Convert.tsx` line 73-76 — on completion, sets `step="completed"` and shows inline results instead of navigating to `/job/{id}`.

2. **Bugs 2, 3, 4 (Summary language breaks session)**: `JobDetail.tsx` line 29-31 — `if (!user) navigate("/login")` fires during token refresh. When `regenerate` edge function is invoked, the brief auth token refresh causes `user` to become null, triggering redirect to `/login`. This makes it *look* like a new job was created or session broke.

3. **Bug 3 (Language label mismatch)**: `JobResults.tsx` line 135 — `setSummaryLang(langCode)` is set optimistically but never reverted on error.

4. **Bug 5 (Session fragility)**: Same root cause as bugs 2/4 — `History.tsx` line 46-48 and `Credits.tsx` line 12-14 also redirect without checking `loading` state.

## Verification of Summary Language Flow (Edge Function)

The `regenerate` edge function (already reviewed):
- Receives `job_id` + `output_type: "summary"` + `target_language`
- Deletes existing summary row: `DELETE FROM job_outputs WHERE job_id = X AND output_type = 'summary'`
- Inserts new summary row under same `job_id`
- Increments `regeneration_count` on the same job
- **Does NOT create a new job** — confirmed
- **Same job_id preserved** — confirmed
- **Only summary output replaced** — confirmed (filtered by `output_type = 'summary'`)
- **No duplicate rows** — delete then insert pattern prevents duplicates

## Implementation Steps

### Step 1: Fix `JobDetail.tsx` auth guard
Change `useEffect` to check `loading` before redirecting:
```tsx
const { user, loading: authLoading } = useAuth();
useEffect(() => {
  if (!authLoading && !user) navigate("/login");
}, [user, authLoading, navigate]);
```

### Step 2: Fix `Convert.tsx` — navigate on completion
Change the polling completion handler (line 73-76) to navigate instead of showing inline results:
```tsx
} else if (job.status === "completed") {
  if (pollRef.current) clearInterval(pollRef.current);
  setProcessing(false);
  navigate(`/job/${jobId}`);
}
```
Remove the `step === "completed"` JSX branch (lines 183-204) since we navigate away.

### Step 3: Fix `JobResults.tsx` — revert language on error
Save previous language before setting new one. On error, revert:
```tsx
const prevLang = summaryLang;
setSummaryLang(langCode);
// ...on error:
setSummaryLang(prevLang);
```

### Step 4: Fix `History.tsx` auth guard
Change line 46-48 to use `loading` from AuthContext.

### Step 5: Fix `Credits.tsx` auth guard
Change line 12-14 to use `loading` + `useEffect` pattern instead of inline redirect during render.

## Files Changed
- `src/pages/JobDetail.tsx` — auth guard
- `src/pages/Convert.tsx` — navigate on completion, remove inline completed state
- `src/components/JobResults.tsx` — revert summaryLang on error
- `src/pages/History.tsx` — auth guard
- `src/pages/Credits.tsx` — auth guard

## No Changes Needed
- No edge function changes
- No database/migration changes
- No guest flow changes
- No UI redesign

