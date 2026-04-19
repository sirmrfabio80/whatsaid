ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS watchdog_retry_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.jobs.watchdog_retry_count IS
  'Number of times the watchdog has re-kicked transcribe for this job. Capped at 1 retry before failing.';