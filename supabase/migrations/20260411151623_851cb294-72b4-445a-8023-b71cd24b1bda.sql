-- Add speaker_names jsonb column to jobs
ALTER TABLE public.jobs
ADD COLUMN speaker_names jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow authenticated users to update their own jobs
CREATE POLICY "Users can update own jobs"
ON public.jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);