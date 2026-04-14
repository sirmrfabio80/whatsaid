

# Async Jobs & Notifications System — Final Revised Plan

## Architecture

Two-table system with clearly separated concerns.

```text
┌───────────────────────────────────────────────┐
│  async_jobs (live work state)                 │
│  - tracks in-progress + completed work        │
│  - stale job cleanup via timeout              │
│  - realtime-enabled                           │
└──────────────────┬────────────────────────────┘
                   │ notification inserted on
                   │ terminal state only
┌──────────────────▼────────────────────────────┐
│  notifications (user-facing events)           │
│  - read/unread state                          │
│  - stores stable storage paths, not signed URLs│
│  - fresh signed URL generated on click        │
└───────────────────────────────────────────────┘
```

## Data Model

### Table: `async_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| job_type | text NOT NULL | "transcription", "pdf_export", extensible |
| status | text NOT NULL | "queued", "processing", "completed", "failed" |
| title | text NOT NULL | user-facing label |
| error_message | text | on failure |
| resource_type | text | e.g. "job", "file" |
| resource_id | text | e.g. existing jobs.id |
| resource_url | text | stable storage path (e.g. `exports/{user_id}/{uuid}.pdf`) — NOT a signed URL |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |
| completed_at | timestamptz | |

RLS: users can SELECT own rows. INSERT/UPDATE via service role + own rows for client-initiated jobs. Realtime enabled.

### Table: `notifications`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| type | text NOT NULL | "transcript_ready", "pdf_ready", "job_failed" |
| title | text NOT NULL | |
| description | text | |
| status | text NOT NULL | "success", "error", "info" |
| read | boolean | default false |
| resource_type | text | "job", "file" |
| resource_id | text | |
| resource_url | text | stable storage path — signed URL generated on demand |
| async_job_id | uuid | FK to async_jobs, nullable |
| created_at | timestamptz | default now() |

RLS: users can SELECT + UPDATE (mark read) own rows. INSERT allowed for own rows + service role. Realtime enabled.

## Refinement 1: Stale PDF Job Cleanup

PDF export jobs are client-side. If the browser closes mid-generation, the `async_jobs` row stays `processing` forever.

**Strategy:**

- PDF export `async_jobs` rows get a `job_type = 'pdf_export'`.
- A DB function `cleanup_stale_async_jobs()` runs periodically (pg_cron, every 5 minutes) and marks any `pdf_export` job stuck in `processing` for longer than 5 minutes as `failed` with `error_message = 'Export timed out — please try again'`.
- A corresponding notification is created for the user so they know to retry.
- Transcription jobs are NOT affected — they have their own server-side lifecycle.

```sql
-- Pseudocode for the cleanup function
UPDATE async_jobs
SET status = 'failed',
    error_message = 'Export timed out — please try again',
    completed_at = now(),
    updated_at = now()
WHERE job_type = 'pdf_export'
  AND status = 'processing'
  AND created_at < now() - interval '5 minutes';
-- Then insert a notification for each affected row
```

This is implemented as a scheduled edge function (`cleanup-stale-jobs`) invoked via pg_cron.

## Refinement 2: Durable Storage Paths, Not Signed URLs

- `resource_url` in both `async_jobs` and `notifications` stores a **stable storage path** like `exports/{user_id}/{async_job_id}.pdf` — never a signed URL.
- When the user clicks a PDF notification, the client calls `supabase.storage.from('exports').createSignedUrl(path, 300)` to get a fresh 5-minute signed URL, then opens it.
- This survives indefinitely — no expiry concerns on the notification itself.

## Phased Rollout

### Phase 1: Transcript notifications + bell UI

- Create `notifications` table with RLS + realtime.
- `NotificationsContext`: loads notifications on mount, realtime subscription, provides `markRead`, `markAllRead`, `unreadCount`.
- `NotificationBell` component in Navbar with unread badge and dropdown.
- `post-process` edge function: insert notification on job completion/failure (single source of truth — no client-side duplicate).
- `Convert.tsx`: unchanged polling + navigation. Does NOT insert notifications.
- i18n strings for en/fr/it.

### Phase 2: Durable PDF export jobs

- Create `async_jobs` table with RLS + realtime.
- Create `exports` private storage bucket with user-scoped RLS.
- Add `startPdfExport()` to `NotificationsContext`: creates `async_jobs` row → generates PDF client-side → uploads to `exports` bucket → creates notification with stable path → marks job completed. On failure: marks job failed + creates error notification.
- `ExportButton.tsx`: PDF calls `startPdfExport()` from context. TXT/JSON/DOC unchanged.
- `cleanup-stale-jobs` edge function + pg_cron schedule: marks stale `pdf_export` jobs as failed after 5 minutes.
- Notification click handler: generates fresh signed URL from storage path, opens download.

## Files Changed

| File | Change | Phase |
|------|--------|-------|
| New migration | `notifications` table, RLS, realtime | 1 |
| `src/contexts/NotificationsContext.tsx` | New — load, subscribe, mark read | 1 |
| `src/components/NotificationBell.tsx` | New — bell + dropdown | 1 |
| `src/components/NotificationItem.tsx` | New — single row with signed URL on click | 1 |
| `src/components/Navbar.tsx` | Add NotificationBell | 1 |
| `src/App.tsx` | Wrap with NotificationsProvider | 1 |
| `supabase/functions/post-process/index.ts` | Insert notification on terminal state | 1 |
| `src/i18n/locales/{en,fr,it}.json` | Notification strings | 1 |
| New migration | `async_jobs` table, `exports` bucket, RLS, realtime | 2 |
| `src/contexts/NotificationsContext.tsx` | Add `startPdfExport()`, job tracking | 2 |
| `src/components/ExportButton.tsx` | PDF calls context method | 2 |
| `supabase/functions/cleanup-stale-jobs/index.ts` | New — marks stale pdf_export jobs as failed | 2 |
| pg_cron schedule | Invoke cleanup every 5 minutes | 2 |

## Regression Risks

| Risk | Mitigation |
|------|-----------|
| Existing Convert flow | Unchanged. Notification is additive in post-process only. |
| Navbar layout | Bell only for authenticated users, small icon. |
| TXT/JSON/DOC exports | Remain synchronous, untouched. |
| Stale jobs accumulating | Cleanup function handles timeout + notifies user. |
| Signed URL expiry | No signed URLs stored — generated fresh on click. |

## Test Plan

1. Process transcript → verify one notification in bell (not duplicated)
2. Start transcript → navigate away → verify notification appears on completion
3. Refresh mid-processing → notification still arrives (server-side)
4. Click transcript notification → navigates to `/job/:id`
5. Mark as read / mark all read → badge updates
6. Empty state display
7. Mobile bell layout
8. (Phase 2) Export PDF → navigate away → notification with download link appears
9. (Phase 2) Click PDF notification → fresh signed URL opens download
10. (Phase 2) Close browser mid-PDF-export → after 5 min, stale job marked failed with notification
11. (Phase 2) TXT/JSON/DOC exports still work inline

