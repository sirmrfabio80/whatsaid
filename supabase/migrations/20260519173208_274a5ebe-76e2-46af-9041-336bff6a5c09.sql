CREATE POLICY "Admins can view all usage events"
ON public.usage_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));