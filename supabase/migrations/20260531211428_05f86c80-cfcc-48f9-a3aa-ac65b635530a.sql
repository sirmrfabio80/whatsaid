ALTER TABLE public.transcript_shares
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_by_label text,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

ALTER TABLE public.transcript_shares
  ADD CONSTRAINT transcript_shares_revoke_reason_length
  CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 500);