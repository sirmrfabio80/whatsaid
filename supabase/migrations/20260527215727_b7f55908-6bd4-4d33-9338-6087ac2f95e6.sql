
-- retention_config table
CREATE TABLE public.retention_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL UNIQUE,
  description text,
  legal_basis text,
  retention_days integer NOT NULL CHECK (retention_days >= 0 AND retention_days <= 3650),
  strategy text NOT NULL CHECK (strategy IN ('delete','anonymize')),
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.retention_config TO authenticated;
GRANT ALL ON public.retention_config TO service_role;

ALTER TABLE public.retention_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention config"
  ON public.retention_config FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update retention config"
  ON public.retention_config FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on retention_config"
  ON public.retention_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- retention_config_audit table (append-only)
CREATE TABLE public.retention_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text
);

GRANT SELECT ON public.retention_config_audit TO authenticated;
GRANT ALL ON public.retention_config_audit TO service_role;

ALTER TABLE public.retention_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention audit"
  ON public.retention_config_audit FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on retention_config_audit"
  ON public.retention_config_audit FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.retention_config_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NEW.dataset_key IS DISTINCT FROM OLD.dataset_key THEN
    RAISE EXCEPTION 'retention_config.dataset_key is immutable';
  END IF;

  v_before := jsonb_build_object(
    'retention_days', OLD.retention_days,
    'strategy', OLD.strategy,
    'enabled', OLD.enabled,
    'description', OLD.description,
    'legal_basis', OLD.legal_basis
  );
  v_after := jsonb_build_object(
    'retention_days', NEW.retention_days,
    'strategy', NEW.strategy,
    'enabled', NEW.enabled,
    'description', NEW.description,
    'legal_basis', NEW.legal_basis
  );

  IF v_before = v_after THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_reason := current_setting('app.retention_change_reason', true);
  EXCEPTION WHEN OTHERS THEN
    v_reason := NULL;
  END;

  INSERT INTO public.retention_config_audit (dataset_key, changed_by, before, after, reason)
  VALUES (NEW.dataset_key, COALESCE(NEW.updated_by, auth.uid()), v_before, v_after, NULLIF(v_reason, ''));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_retention_config_audit
  AFTER UPDATE ON public.retention_config
  FOR EACH ROW EXECUTE FUNCTION public.retention_config_audit_fn();

-- Seed defaults
INSERT INTO public.retention_config (dataset_key, description, legal_basis, retention_days, strategy, enabled) VALUES
  ('consent_events', 'Reg.37 consent acknowledgements (PII anonymised after horizon)', 'contract_defence_6y', 2190, 'anonymize', true),
  ('credit_transactions', 'Credit ledger entries (contractual / tax records)', 'contract_tax_6y', 2190, 'delete', false),
  ('email_send_log', 'Transactional email delivery logs', 'legitimate_interest_180d', 180, 'delete', true),
  ('usage_events', 'AI/share usage ledger for quota enforcement', 'legitimate_interest_90d', 90, 'delete', true),
  ('cleanup_logs', 'Storage cleanup run logs', 'legitimate_interest_30d', 30, 'delete', true),
  ('async_jobs_finished', 'Finished async background jobs', 'legitimate_interest_30d', 30, 'delete', true);
