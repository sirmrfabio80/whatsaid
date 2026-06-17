CREATE TABLE public.admin_region_bypass_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  detected_country TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_region_bypass_log_user_id ON public.admin_region_bypass_log(user_id);
CREATE INDEX idx_admin_region_bypass_log_created_at ON public.admin_region_bypass_log(created_at DESC);

GRANT SELECT ON public.admin_region_bypass_log TO authenticated;
GRANT ALL ON public.admin_region_bypass_log TO service_role;

ALTER TABLE public.admin_region_bypass_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view bypass log"
  ON public.admin_region_bypass_log
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
