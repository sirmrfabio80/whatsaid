-- Lock billing-sensitive columns on jobs from client updates.
-- Service role keeps unrestricted access for legitimate backend pipeline writes.

CREATE OR REPLACE FUNCTION public.lock_jobs_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role bypass (all backend edge functions hit Postgres as service_role).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'jobs.user_id is immutable from the client';
  END IF;
  IF NEW.credits_charged IS DISTINCT FROM OLD.credits_charged THEN
    RAISE EXCEPTION 'jobs.credits_charged is immutable from the client';
  END IF;
  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN
    RAISE EXCEPTION 'jobs.duration_seconds is immutable from the client';
  END IF;
  IF NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
    RAISE EXCEPTION 'jobs.file_size_bytes is immutable from the client';
  END IF;
  IF NEW.file_name IS DISTINCT FROM OLD.file_name THEN
    RAISE EXCEPTION 'jobs.file_name is immutable from the client';
  END IF;
  IF NEW.guest_token IS DISTINCT FROM OLD.guest_token THEN
    RAISE EXCEPTION 'jobs.guest_token is immutable from the client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_lock_billing_columns ON public.jobs;

CREATE TRIGGER trg_jobs_lock_billing_columns
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.lock_jobs_billing_columns();

COMMENT ON FUNCTION public.lock_jobs_billing_columns IS
  'Phase 2 spend guardrail: blocks client updates to billing-sensitive jobs columns. Service role bypasses.';
