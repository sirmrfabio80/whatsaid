CREATE TABLE IF NOT EXISTS public.seo_monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('warning','error')),
  category text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS seo_monitoring_alerts_open_idx
  ON public.seo_monitoring_alerts (last_seen_at DESC)
  WHERE resolved_at IS NULL;
ALTER TABLE public.seo_monitoring_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view seo alerts"
  ON public.seo_monitoring_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));