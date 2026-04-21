
CREATE TABLE public.cleanup_config (
  id INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
  share_pdf_cache_ttl_days INTEGER NOT NULL DEFAULT 30 CHECK (share_pdf_cache_ttl_days BETWEEN 1 AND 365),
  cleanup_batch_size INTEGER NOT NULL DEFAULT 1000 CHECK (cleanup_batch_size BETWEEN 50 AND 10000),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT cleanup_config_singleton CHECK (id = 1)
);

INSERT INTO public.cleanup_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cleanup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cleanup config"
  ON public.cleanup_config FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cleanup config"
  ON public.cleanup_config FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on cleanup_config"
  ON public.cleanup_config FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE TRIGGER update_cleanup_config_updated_at
  BEFORE UPDATE ON public.cleanup_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
