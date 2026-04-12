-- Create transcript_shares table
CREATE TABLE public.transcript_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  job_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  recipient_email text NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  claimed_by uuid,
  claimed_job_id uuid,
  claimed_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for token lookups
CREATE INDEX idx_transcript_shares_token ON public.transcript_shares(token);
-- Index for recipient email lookups
CREATE INDEX idx_transcript_shares_recipient ON public.transcript_shares(recipient_email);

-- Enable RLS
ALTER TABLE public.transcript_shares ENABLE ROW LEVEL SECURITY;

-- Users can view shares they created
CREATE POLICY "Users can view own shares"
  ON public.transcript_shares
  FOR SELECT
  USING (auth.uid() = shared_by);

-- Service role has full access for backend operations
CREATE POLICY "Service role full access"
  ON public.transcript_shares
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');