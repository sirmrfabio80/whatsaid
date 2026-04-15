ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS assemblyai_transcript_id text,
ADD COLUMN IF NOT EXISTS assemblyai_delete_status text DEFAULT 'pending';