
CREATE TABLE public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  credits integer NOT NULL,
  package_id text NOT NULL,
  invited_by uuid NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access"
  ON public.pending_invites
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admin can view all invites
CREATE POLICY "Admin can view invites"
  ON public.pending_invites
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can view own unclaimed invites by email
CREATE POLICY "Users can view own pending invites"
  ON public.pending_invites
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'email' = email AND claimed = false);
