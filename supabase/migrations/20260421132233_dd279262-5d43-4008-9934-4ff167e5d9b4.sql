-- Create a table to log cleanup-expired-shares runs
CREATE TABLE public.cleanup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  shared_pdfs_deleted INTEGER NOT NULL DEFAULT 0,
  shared_pdfs_orphans_deleted INTEGER NOT NULL DEFAULT 0,
  exports_deleted INTEGER NOT NULL DEFAULT 0,
  missing_prefixes INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast recent-run queries
CREATE INDEX idx_cleanup_logs_job_started ON public.cleanup_logs(job_name, started_at DESC);

-- Enable RLS
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Service role: full access (edge function writes here)
CREATE POLICY "Service role full access on cleanup_logs"
ON public.cleanup_logs
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Admins can read cleanup logs (for the admin dashboard)
CREATE POLICY "Admins can view cleanup logs"
ON public.cleanup_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));