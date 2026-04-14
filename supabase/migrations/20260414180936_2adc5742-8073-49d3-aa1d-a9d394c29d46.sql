ALTER TABLE public.jobs
  ADD COLUMN summary_needs_regen boolean NOT NULL DEFAULT false,
  ADD COLUMN summary_regen_count integer NOT NULL DEFAULT 0;