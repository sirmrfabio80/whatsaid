
-- Create table for translated content variants
CREATE TABLE public.job_output_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_output_id UUID NOT NULL REFERENCES public.job_outputs(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_output_id, language)
);

-- Enable RLS
ALTER TABLE public.job_output_variants ENABLE ROW LEVEL SECURITY;

-- Users can view variants of their own job outputs
CREATE POLICY "Users can view own variants"
ON public.job_output_variants
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.job_outputs jo
  JOIN public.jobs j ON j.id = jo.job_id
  WHERE jo.id = job_output_variants.job_output_id AND j.user_id = auth.uid()
));

-- Service role full access for edge functions
CREATE POLICY "Service role full access on variants"
ON public.job_output_variants
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add output_language column to jobs
ALTER TABLE public.jobs ADD COLUMN output_language TEXT;
