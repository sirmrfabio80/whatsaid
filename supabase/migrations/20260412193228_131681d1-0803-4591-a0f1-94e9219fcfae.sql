CREATE POLICY "Users can update outputs of own jobs"
ON public.job_outputs FOR UPDATE
USING (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()));