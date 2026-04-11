-- Allow users to delete their own jobs
CREATE POLICY "Users can delete own jobs"
ON public.jobs
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete outputs of their own jobs
CREATE POLICY "Users can delete outputs of own jobs"
ON public.job_outputs
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()
));