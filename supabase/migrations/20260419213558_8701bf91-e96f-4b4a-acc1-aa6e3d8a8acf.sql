-- Reviews table
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT reviews_user_unique UNIQUE (user_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can read (needed for homepage aggregate)
CREATE POLICY "Reviews are publicly readable"
ON public.reviews
FOR SELECT
USING (true);

-- Authenticated users manage their own review
CREATE POLICY "Users can insert own review"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own review"
ON public.reviews
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own review"
ON public.reviews
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Admins can delete any review (moderation)
CREATE POLICY "Admins can delete any review"
ON public.reviews
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregate function (callable by anon for SEO/SSR-style fetch)
CREATE OR REPLACE FUNCTION public.get_review_aggregate()
RETURNS TABLE (rating_value NUMERIC, review_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS rating_value,
    COUNT(*)::bigint AS review_count
  FROM public.reviews;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_aggregate() TO anon, authenticated;