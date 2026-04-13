-- Add raw_response and metadata columns to job_outputs for storing full AssemblyAI response
ALTER TABLE public.job_outputs ADD COLUMN IF NOT EXISTS raw_response jsonb;
ALTER TABLE public.job_outputs ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Add transcription_config column to jobs for evaluation/comparison logging
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS transcription_config jsonb;