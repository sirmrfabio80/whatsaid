

# Plan — Resumable uploads + heartbeat

Keep the existing client-side enhancement pipeline exactly as-is. Just make the **upload** step resumable and have the client send a "still alive" signal every 60s, so the watchdog (already shipped) only fails truly-dead uploads instead of slow but live ones.

## What changes

1. **Switch the storage upload to TUS resumable**
   - Replace the single `supabase.storage.from("temp-audio").upload(...)` call in `src/pages/Convert.tsx` with the `tus-js-client` library pointed at the Supabase Storage TUS endpoint (`/storage/v1/upload/resumable`), authenticated with the user's session token.
   - 6 MB chunks, automatic retry on transient network errors (3 retries with exponential backoff: 0 / 3s / 5s / 10s / 20s).
   - On each successful chunk, update local upload progress AND bump `jobs.updated_at` (heartbeat — see #2).
   - A failed chunk after retries surfaces a clean "Upload paused — retrying…" toast instead of failing the whole job.
   - The TUS upload `Upload-Metadata` carries `bucketName=temp-audio`, `objectName=<userId>/<jobId>/<safeName>`, `contentType=<file mime>`.

2. **60-second heartbeat while client work is in progress**
   - New helper `useJobHeartbeat(jobId, stage)` in `src/hooks/use-job-heartbeat.ts`.
   - While `processing === true` and `step` is one of `preparing | enhancing | uploading`, it runs `setInterval` every 60s and writes:
     ```ts
     supabase.from("jobs").update({
       processing_stage: stage,                   // current local step
       updated_at: new Date().toISOString(),      // explicit bump
     }).eq("id", jobId);
     ```
   - Stops on unmount, on success, or on error.
   - `updated_at` is the column the watchdog already checks (`lt("updated_at", uploadingCutoff)`), so a live tab will never look stale.

3. **Resume across page reloads**
   - TUS upload URL is persisted in `localStorage` keyed by `tus::<jobId>`. On page load, if the user returns to `/convert` and the same file is re-selected, we call `tus.Upload.findPreviousUploads()` and resume from the last completed chunk instead of restarting.
   - If the file isn't re-selected (e.g. user closed the tab), the watchdog still wins after 15 min — same behaviour as today.

4. **Watchdog tweak — widen safety margin**
   - Bump `UPLOAD_STALE_MINUTES` from `15` → `20` in `supabase/functions/watchdog-stale-jobs/index.ts`. Heartbeat is every 60s, so 20 min is ~20 missed heartbeats before we declare a session dead. Prevents false positives on very slow connections that still produce occasional chunks.

5. **Admin observability**
   - Extend `transcription_config.upload` JSON written by `Convert.tsx` with `{ resumable: true, chunk_size_mb: 6, retries: <count>, resumed_from_previous: boolean }` so `JobAuditCard` can show whether an upload paused/resumed and how many retries it took. Pure JSON, no schema migration.

## Files touched

```text
package.json                              add "tus-js-client" dep
src/hooks/use-job-heartbeat.ts            NEW — 60s heartbeat hook
src/lib/storage-resumable-upload.ts       NEW — thin TUS wrapper
src/pages/Convert.tsx                     swap upload call, mount heartbeat,
                                          extend transcription_config.upload meta
supabase/functions/watchdog-stale-jobs/   UPLOAD_STALE_MINUTES 15 → 20
src/components/admin/JobAuditCard.tsx     surface upload meta (retries, resumed)
```

No DB migration needed — `transcription_config` is `jsonb`.

## What this fixes

- Slow but live uploads (mobile, weak Wi-Fi, large M4A) no longer race the watchdog: every 60s the row is bumped, so it can never look stale while the tab is open.
- A flaky network drop mid-upload retries automatically (TUS) instead of failing the whole job and losing the credit.
- A user who reloads the page mid-upload can resume from the last chunk if they re-select the same file.
- Tab-closed / device-suspended uploads still get caught by the watchdog after 20 min — same recovery UX shipped last turn.

## What this does *not* do

- Does not move audio enhancement to the server (kept client-side as requested).
- Does not change the `enhancing` step itself — only the `uploading` step is made resumable. A tab closed mid-enhance still relies on the watchdog.
- Does not change pricing, credit deduction, or the AssemblyAI request.

