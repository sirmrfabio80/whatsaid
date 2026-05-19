-- get_review_aggregate: reviews are publicly readable, no need for SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_review_aggregate()
 RETURNS TABLE(rating_value numeric, review_count bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS rating_value,
    COUNT(*)::bigint AS review_count
  FROM public.reviews;
$function$;

-- has_role: keep SECURITY DEFINER (RLS needs to read user_roles which itself
-- has RLS), but restrict callers to checking only their own role. service_role
-- (used by backend edge functions) bypasses the guard.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'has_role: callers may only check their own role';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$function$;
