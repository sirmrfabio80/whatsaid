-- S2-J: Restrict consent_versions read to currently-effective rows (Art. 32 least privilege)
DROP POLICY IF EXISTS "Authenticated can read consent versions" ON public.consent_versions;
CREATE POLICY "Authenticated can read effective consent versions"
ON public.consent_versions
FOR SELECT
TO authenticated
USING (
  effective_from <= now()
  AND (effective_to IS NULL OR effective_to > now())
);
