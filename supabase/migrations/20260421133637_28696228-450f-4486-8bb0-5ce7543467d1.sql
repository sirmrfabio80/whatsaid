
ALTER TABLE public.cleanup_logs
  ADD COLUMN IF NOT EXISTS share_pdf_cache_deleted INTEGER NOT NULL DEFAULT 0;
