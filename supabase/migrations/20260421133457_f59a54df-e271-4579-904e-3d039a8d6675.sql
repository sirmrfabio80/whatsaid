
CREATE TABLE public.share_artifact_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_id UUID NOT NULL,
  format TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('reused', 'uploaded')),
  source TEXT NOT NULL CHECK (source IN ('session', 'db', 'fresh', 'stale-session', 'stale-db')),
  storage_path TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_artifact_log_user_created
  ON public.share_artifact_log (user_id, created_at DESC);

CREATE INDEX idx_share_artifact_log_job
  ON public.share_artifact_log (job_id, created_at DESC);

ALTER TABLE public.share_artifact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own share log"
  ON public.share_artifact_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own share log"
  ON public.share_artifact_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all share log"
  ON public.share_artifact_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on share_artifact_log"
  ON public.share_artifact_log FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
