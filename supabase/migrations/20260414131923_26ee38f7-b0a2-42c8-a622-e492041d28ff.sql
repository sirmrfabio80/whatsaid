-- Create async_jobs table
CREATE TABLE public.async_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  title text NOT NULL,
  error_message text,
  resource_type text,
  resource_id text,
  resource_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.async_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view own async jobs
CREATE POLICY "Users can view own async_jobs"
  ON public.async_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert own async jobs
CREATE POLICY "Users can insert own async_jobs"
  ON public.async_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update own async jobs
CREATE POLICY "Users can update own async_jobs"
  ON public.async_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access on async_jobs"
  ON public.async_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.async_jobs;

-- Index for user queries
CREATE INDEX idx_async_jobs_user_id ON public.async_jobs (user_id, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_async_jobs_updated_at
  BEFORE UPDATE ON public.async_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create exports storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false);

-- Storage policies: users can upload to their own folder
CREATE POLICY "Users can upload own exports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own exports
CREATE POLICY "Users can read own exports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own exports
CREATE POLICY "Users can delete own exports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);