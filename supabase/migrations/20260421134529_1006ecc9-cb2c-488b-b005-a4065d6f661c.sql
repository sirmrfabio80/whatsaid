
-- 1. Cascade delete cache rows when their parent job is removed.
DELETE FROM public.share_pdf_cache c
WHERE NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = c.job_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'share_pdf_cache_job_id_fkey'
  ) THEN
    ALTER TABLE public.share_pdf_cache
      ADD CONSTRAINT share_pdf_cache_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 2. Content hash hex-string sanity check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'share_pdf_cache_content_hash_check'
  ) THEN
    ALTER TABLE public.share_pdf_cache
      ADD CONSTRAINT share_pdf_cache_content_hash_check
      CHECK (length(content_hash) BETWEEN 8 AND 128 AND content_hash ~ '^[0-9a-f]+$');
  END IF;
END$$;

-- 3. Storage path must start with `<job_id>/` and end with `.<format>`.
CREATE OR REPLACE FUNCTION public.validate_share_pdf_cache_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_prefix TEXT;
  expected_ext TEXT;
BEGIN
  IF NEW.storage_path IS NULL OR length(NEW.storage_path) = 0 THEN
    RAISE EXCEPTION 'share_pdf_cache.storage_path cannot be empty';
  END IF;
  expected_prefix := NEW.job_id::text || '/';
  IF position(expected_prefix IN NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'share_pdf_cache.storage_path % must start with job_id prefix %',
      NEW.storage_path, expected_prefix;
  END IF;
  expected_ext := '.' || NEW.format;
  IF right(NEW.storage_path, length(expected_ext)) <> expected_ext THEN
    RAISE EXCEPTION 'share_pdf_cache.storage_path % must end with extension %',
      NEW.storage_path, expected_ext;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_share_pdf_cache_path_trigger ON public.share_pdf_cache;
CREATE TRIGGER validate_share_pdf_cache_path_trigger
  BEFORE INSERT OR UPDATE ON public.share_pdf_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_share_pdf_cache_path();
