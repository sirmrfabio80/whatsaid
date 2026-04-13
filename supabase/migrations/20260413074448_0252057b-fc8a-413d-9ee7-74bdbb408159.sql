
-- 1. tags table
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
  color text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, normalized_name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Normalization trigger
CREATE OR REPLACE FUNCTION public.normalize_tag_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := lower(regexp_replace(trim(NEW.name), '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_tag_name
  BEFORE INSERT OR UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.normalize_tag_name();

-- 3. job_tags table
CREATE TABLE public.job_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, tag_id)
);

ALTER TABLE public.job_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own job tags"
  ON public.job_tags FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_tags.job_id AND jobs.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags WHERE tags.id = job_tags.tag_id AND tags.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own job tags"
  ON public.job_tags FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_tags.job_id AND jobs.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags WHERE tags.id = job_tags.tag_id AND tags.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own job tags"
  ON public.job_tags FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_tags.job_id AND jobs.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags WHERE tags.id = job_tags.tag_id AND tags.user_id = auth.uid())
  );

-- 4. Additional index for filtering jobs by tag
CREATE INDEX idx_job_tags_tag_job ON public.job_tags (tag_id, job_id);
