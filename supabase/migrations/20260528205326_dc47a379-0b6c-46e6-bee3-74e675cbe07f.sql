
-- Idempotency keys for create-job and consent recording
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_idempotency_key_uniq
  ON public.jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND user_id IS NOT NULL;

ALTER TABLE public.consent_events ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS consent_events_user_type_idempotency_uniq
  ON public.consent_events (user_id, consent_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND user_id IS NOT NULL;
