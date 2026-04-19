-- Add processing_stage column to jobs to expose granular progress to the UI
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS processing_stage text;

-- Add an index to help any future filters by stage
CREATE INDEX IF NOT EXISTS idx_jobs_processing_stage ON public.jobs (processing_stage);

COMMENT ON COLUMN public.jobs.processing_stage IS
  'Granular progress within status=processing. One of: queued, transcribing, summarising, tagging, finalising, done.';