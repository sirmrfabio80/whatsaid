
ALTER TABLE public.transcript_shares
  ADD COLUMN IF NOT EXISTS revocation_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS transcript_shares_revocation_token_key
  ON public.transcript_shares (revocation_token);
