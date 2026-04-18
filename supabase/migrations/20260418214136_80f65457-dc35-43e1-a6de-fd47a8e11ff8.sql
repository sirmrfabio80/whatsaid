
-- 1. tag_translations: global cache
CREATE TABLE public.tag_translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  translated_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tag_translations_name_lang_idx
  ON public.tag_translations (normalized_name, target_lang);

ALTER TABLE public.tag_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tag translations"
ON public.tag_translations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role full access on tag_translations"
ON public.tag_translations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. tag_quality_flags: log of suspicious AI tags
CREATE TABLE public.tag_quality_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  detected_lang TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT tag_quality_flags_status_check CHECK (status IN ('open','resolved','dismissed'))
);

-- One open flag per tag
CREATE UNIQUE INDEX tag_quality_flags_open_tag_idx
  ON public.tag_quality_flags (tag_id)
  WHERE status = 'open';

ALTER TABLE public.tag_quality_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tag quality flags"
ON public.tag_quality_flags
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tag quality flags"
ON public.tag_quality_flags
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tag quality flags"
ON public.tag_quality_flags
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access on tag_quality_flags"
ON public.tag_quality_flags
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 3. Cache invalidation trigger
CREATE OR REPLACE FUNCTION public.invalidate_tag_translation_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.normalized_name IS DISTINCT FROM OLD.normalized_name THEN
    DELETE FROM public.tag_translations
    WHERE normalized_name = OLD.normalized_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tags_invalidate_translation_cache
AFTER UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_tag_translation_cache();
