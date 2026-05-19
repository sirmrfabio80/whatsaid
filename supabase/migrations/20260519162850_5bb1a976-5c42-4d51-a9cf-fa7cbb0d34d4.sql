
-- Usage events ledger
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NULL,
  action text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('user_day','job_day','job_lifetime','user_lifetime','recipient_job_day')),
  scope_key text NULL,
  units integer NOT NULL DEFAULT 1,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_action_created
  ON public.usage_events (user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_job_action_created
  ON public.usage_events (job_id, action, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_action_scope_key_created
  ON public.usage_events (action, scope_key, created_at DESC)
  WHERE scope_key IS NOT NULL;

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage events"
  ON public.usage_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on usage_events"
  ON public.usage_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Atomic quota check + record
CREATE OR REPLACE FUNCTION public.check_and_record_usage(
  p_user_id uuid,
  p_action text,
  p_scope text,
  p_job_id uuid DEFAULT NULL,
  p_scope_key text DEFAULT NULL,
  p_window interval DEFAULT NULL,
  p_limit integer DEFAULT 0,
  p_units integer DEFAULT 1,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_used integer;
  v_since timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_action IS NULL OR p_scope IS NULL THEN
    RAISE EXCEPTION 'check_and_record_usage: user_id, action, scope required';
  END IF;
  IF p_limit < 0 OR p_units < 1 THEN
    RAISE EXCEPTION 'check_and_record_usage: invalid limit/units';
  END IF;

  -- Per (user, action) advisory lock to serialize concurrent calls
  v_lock_key := abs(hashtextextended(p_user_id::text || '|' || p_action, 0));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_since := CASE WHEN p_window IS NULL THEN NULL ELSE now() - p_window END;

  IF p_scope = 'user_day' OR p_scope = 'user_lifetime' THEN
    SELECT COALESCE(SUM(units), 0) INTO v_used
    FROM public.usage_events
    WHERE user_id = p_user_id
      AND action = p_action
      AND (v_since IS NULL OR created_at >= v_since);
  ELSIF p_scope = 'job_day' OR p_scope = 'job_lifetime' THEN
    IF p_job_id IS NULL THEN
      RAISE EXCEPTION 'job scope requires job_id';
    END IF;
    SELECT COALESCE(SUM(units), 0) INTO v_used
    FROM public.usage_events
    WHERE job_id = p_job_id
      AND action = p_action
      AND (v_since IS NULL OR created_at >= v_since);
  ELSIF p_scope = 'recipient_job_day' THEN
    IF p_job_id IS NULL OR p_scope_key IS NULL THEN
      RAISE EXCEPTION 'recipient_job_day requires job_id and scope_key';
    END IF;
    SELECT COALESCE(SUM(units), 0) INTO v_used
    FROM public.usage_events
    WHERE job_id = p_job_id
      AND action = p_action
      AND scope_key = p_scope_key
      AND (v_since IS NULL OR created_at >= v_since);
  ELSE
    RAISE EXCEPTION 'unknown scope: %', p_scope;
  END IF;

  IF v_used + p_units > p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', p_limit,
      'scope', p_scope
    );
  END IF;

  INSERT INTO public.usage_events (user_id, job_id, action, scope, scope_key, units, metadata)
  VALUES (p_user_id, p_job_id, p_action, p_scope, p_scope_key, p_units, p_metadata);

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used + p_units,
    'limit', p_limit,
    'scope', p_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_usage(uuid, text, text, uuid, text, interval, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_record_usage(uuid, text, text, uuid, text, interval, integer, integer, jsonb) TO service_role;
