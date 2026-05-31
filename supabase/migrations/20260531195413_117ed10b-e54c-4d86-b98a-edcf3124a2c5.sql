
CREATE TABLE public.share_view_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL,
  recipient_email_lower text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_view_otps_token ON public.share_view_otps(share_token);
CREATE INDEX idx_share_view_otps_expires ON public.share_view_otps(expires_at);

GRANT ALL ON public.share_view_otps TO service_role;

ALTER TABLE public.share_view_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on share_view_otps"
ON public.share_view_otps FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.transcript_shares
  ADD COLUMN IF NOT EXISTS last_view_otp_sent_at timestamptz;
