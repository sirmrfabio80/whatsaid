
-- =============================================================
-- Phase 3 — DSR (Data Subject Rights) self-service
-- =============================================================

-- 1) dsr_requests audit table
CREATE TABLE public.dsr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('access','rectification','portability','erasure')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','fulfilled','rejected')),
  requested_via text NOT NULL DEFAULT 'self_service'
    CHECK (requested_via IN ('self_service','support_email')),
  field text,
  requested_value text,
  reason text,
  notes text,
  export_storage_path text,
  export_expires_at timestamptz,
  fulfilled_at timestamptz,
  fulfilled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dsr_requests TO authenticated;
GRANT ALL ON public.dsr_requests TO service_role;

ALTER TABLE public.dsr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own DSR rows"
  ON public.dsr_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all DSR rows"
  ON public.dsr_requests
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on dsr_requests"
  ON public.dsr_requests
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_dsr_requests_user ON public.dsr_requests(user_id, created_at DESC);
CREATE INDEX idx_dsr_requests_status ON public.dsr_requests(status, kind, created_at DESC);

CREATE TRIGGER trg_dsr_requests_updated_at
  BEFORE UPDATE ON public.dsr_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Anonymise-on-delete helper used by delete-account
CREATE OR REPLACE FUNCTION private.anonymise_dsr_requests(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.dsr_requests
     SET user_id = NULL,
         reason = NULL,
         requested_value = NULL
   WHERE user_id = _user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.anonymise_dsr_requests(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.anonymise_dsr_requests(uuid) TO service_role;

-- 3) Admin-applied rectification RPC (audit-friendly)
CREATE OR REPLACE FUNCTION public.admin_apply_rectification(
  p_request_id uuid,
  p_new_value text,
  p_note text
) RETURNS public.dsr_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dsr_requests;
  v_uid uuid;
  v_field text;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.dsr_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dsr request not found';
  END IF;
  IF v_row.kind <> 'rectification' OR v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not a pending rectification request';
  END IF;
  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'request is anonymised';
  END IF;

  v_uid := v_row.user_id;
  v_field := v_row.field;

  IF v_field = 'country' THEN
    IF p_new_value !~ '^[A-Za-z]{2}$' THEN
      RAISE EXCEPTION 'country must be ISO-2';
    END IF;
    UPDATE public.profiles
       SET country = upper(p_new_value), updated_at = now()
     WHERE user_id = v_uid;
  ELSIF v_field = 'email' THEN
    -- Mirror only; auth.users.email change must be performed by edge fn via admin API.
    UPDATE public.profiles
       SET email = p_new_value, updated_at = now()
     WHERE user_id = v_uid;
  ELSE
    RAISE EXCEPTION 'unsupported field: %', v_field;
  END IF;

  UPDATE public.dsr_requests
     SET status = 'fulfilled',
         fulfilled_at = now(),
         fulfilled_by = auth.uid(),
         notes = COALESCE(notes || E'\n', '') || COALESCE(p_note, ''),
         updated_at = now()
   WHERE id = p_request_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_apply_rectification(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_rectification(uuid, text, text) TO authenticated, service_role;

-- 4) Private storage bucket for portability exports
INSERT INTO storage.buckets (id, name, public)
VALUES ('dsr-exports', 'dsr-exports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own DSR exports"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dsr-exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5) Wire into the Phase 2 retention sweeper (data row only; mapping in code)
INSERT INTO public.retention_config (dataset_key, retention_days, strategy, enabled, description, legal_basis)
VALUES (
  'dsr_exports',
  7,
  'delete',
  true,
  'Signed-URL portability ZIPs in storage bucket dsr-exports',
  'Operational — short-lived download artefact only'
)
ON CONFLICT (dataset_key) DO NOTHING;
