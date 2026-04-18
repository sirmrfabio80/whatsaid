-- Phase 1: Add missing indexes on hot paths
-- All indexes are additive, low-risk, and improve read performance with
-- minimal write-cost trade-offs.

-- 1) jobs: History page lists user's jobs ordered by created_at DESC.
--    Composite index supports both the user_id filter (RLS predicate) and
--    the ORDER BY without a sort.
CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON public.jobs (user_id, created_at DESC);

-- 2) jobs: cleanup-stale-jobs scans only active statuses. Partial index
--    keeps the index tiny (most rows are 'completed' or 'failed').
CREATE INDEX IF NOT EXISTS idx_jobs_status_active
  ON public.jobs (status)
  WHERE status IN ('pending', 'uploading', 'processing');

-- 3) jobs: guest claim flow looks up by guest_token. Unique partial index
--    enforces guest token uniqueness without affecting non-guest rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_guest_token
  ON public.jobs (guest_token)
  WHERE guest_token IS NOT NULL;

-- 4) job_outputs: JobDetail loads all outputs for a job. RLS subqueries
--    also resolve job_id → user_id. Composite includes created_at so
--    "outputs newest first" doesn't need a sort.
CREATE INDEX IF NOT EXISTS idx_job_outputs_job_created
  ON public.job_outputs (job_id, created_at DESC);

-- 5) credit_transactions: user's credit history listing.
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created
  ON public.credit_transactions (user_id, created_at DESC);

-- 6) notifications: NotificationsContext correlates notifications with
--    background async_jobs. Partial keeps it small (most rows are null).
CREATE INDEX IF NOT EXISTS idx_notifications_async_job
  ON public.notifications (async_job_id)
  WHERE async_job_id IS NOT NULL;

-- 7) pending_invites: redeem flow looks up by email where claimed = false.
CREATE INDEX IF NOT EXISTS idx_pending_invites_email_unclaimed
  ON public.pending_invites (email)
  WHERE claimed = false;

-- 8) transcript_shares: two queries — "shares for this job" and
--    "all shares I created, newest first".
CREATE INDEX IF NOT EXISTS idx_transcript_shares_job
  ON public.transcript_shares (job_id);

CREATE INDEX IF NOT EXISTS idx_transcript_shares_owner_created
  ON public.transcript_shares (shared_by, created_at DESC);