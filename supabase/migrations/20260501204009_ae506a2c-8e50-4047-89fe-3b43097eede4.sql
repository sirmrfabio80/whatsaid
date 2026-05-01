ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS language_detected_preview text,
  ADD COLUMN IF NOT EXISTS language_preview_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS language_preview_error text;