ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recorded_at_source TEXT;

UPDATE public.jobs
SET recorded_at = created_at,
    recorded_at_source = COALESCE(recorded_at_source, 'job_created_fallback')
WHERE recorded_at IS NULL;

COMMENT ON COLUMN public.jobs.recorded_at IS 'User-facing recording/imported timestamp shown on the job page.';
COMMENT ON COLUMN public.jobs.recorded_at_source IS 'Source of recorded_at, e.g. file_last_modified, manual, or job_created_fallback.';