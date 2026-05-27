
CREATE OR REPLACE FUNCTION public.admin_update_retention_config(
  p_dataset_key text,
  p_retention_days integer,
  p_strategy text,
  p_enabled boolean,
  p_description text,
  p_legal_basis text,
  p_reason text
)
RETURNS public.retention_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.retention_config;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason is required (min 5 chars)';
  END IF;
  IF p_strategy NOT IN ('delete','anonymize') THEN
    RAISE EXCEPTION 'invalid strategy';
  END IF;
  IF p_retention_days < 0 OR p_retention_days > 3650 THEN
    RAISE EXCEPTION 'invalid retention_days';
  END IF;

  PERFORM set_config('app.retention_change_reason', p_reason, true);

  UPDATE public.retention_config
  SET retention_days = p_retention_days,
      strategy = p_strategy,
      enabled = p_enabled,
      description = p_description,
      legal_basis = p_legal_basis,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE dataset_key = p_dataset_key
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset_key not found: %', p_dataset_key;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_retention_config(text,integer,text,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_retention_config(text,integer,text,boolean,text,text,text) TO authenticated;
