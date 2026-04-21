-- Cross-tab dedup cache for share PDFs.
-- Key: (job_id, content_hash). Owner-scoped via RLS.
CREATE TABLE public.share_pdf_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT share_pdf_cache_job_hash_unique UNIQUE (job_id, content_hash)
);

-- Fast lookup by (job_id, content_hash) is covered by the unique constraint.
-- Add an index on last_used_at to support TTL sweeps in cleanup-expired-shares.
CREATE INDEX idx_share_pdf_cache_last_used ON public.share_pdf_cache(last_used_at);

-- Enable RLS — owner-scoped + service role.
ALTER TABLE public.share_pdf_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on share_pdf_cache"
ON public.share_pdf_cache
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Owners can read their own cache entries (scoped by ownership of the underlying job).
CREATE POLICY "Users can view own share_pdf_cache"
ON public.share_pdf_cache
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = share_pdf_cache.job_id AND j.user_id = auth.uid()
  )
);

-- Owners can insert cache entries for their own jobs.
CREATE POLICY "Users can insert own share_pdf_cache"
ON public.share_pdf_cache
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = share_pdf_cache.job_id AND j.user_id = auth.uid()
  )
);

-- Owners can bump last_used_at on their own entries.
CREATE POLICY "Users can update own share_pdf_cache"
ON public.share_pdf_cache
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own entries (e.g. when the underlying job is removed).
CREATE POLICY "Users can delete own share_pdf_cache"
ON public.share_pdf_cache
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);