CREATE TABLE public.retention_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_kind text NOT NULL CHECK (alert_kind IN ('run_failed','high_candidates','large_processed_jump','missing_runs')),
  dataset_key text,
  cleanup_log_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_sent boolean NOT NULL DEFAULT false,
  email_error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.retention_alerts TO authenticated;
GRANT ALL ON public.retention_alerts TO service_role;

ALTER TABLE public.retention_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention alerts"
  ON public.retention_alerts
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on retention_alerts"
  ON public.retention_alerts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_retention_alerts_kind_dataset_time
  ON public.retention_alerts (alert_kind, dataset_key, sent_at DESC);