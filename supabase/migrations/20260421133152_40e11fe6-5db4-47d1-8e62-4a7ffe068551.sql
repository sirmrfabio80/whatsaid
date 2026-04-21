-- Add `format` to the share artifact dedup cache so future non-PDF share
-- variants (DOCX/JSON/TXT) cannot collide with an existing PDF entry that
-- happens to hash to the same canonical payload.
--
-- Back-compat: existing rows are PDFs, so default + backfill to 'pdf'.
ALTER TABLE public.share_pdf_cache
  ADD COLUMN format TEXT NOT NULL DEFAULT 'pdf';

-- Constrain to a known set; expand here when we add new share formats.
ALTER TABLE public.share_pdf_cache
  ADD CONSTRAINT share_pdf_cache_format_check
  CHECK (format IN ('pdf', 'docx', 'json', 'txt'));

-- Replace the old unique constraint with one that includes `format`.
ALTER TABLE public.share_pdf_cache
  DROP CONSTRAINT share_pdf_cache_job_hash_unique;

ALTER TABLE public.share_pdf_cache
  ADD CONSTRAINT share_pdf_cache_job_hash_format_unique
  UNIQUE (job_id, content_hash, format);