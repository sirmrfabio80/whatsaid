-- Templates for transcription provider settings (AssemblyAI)
CREATE TABLE public.transcribe_settings_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT transcribe_settings_templates_name_unique UNIQUE (name)
);

-- Only one active template at a time
CREATE UNIQUE INDEX transcribe_settings_templates_one_active
  ON public.transcribe_settings_templates ((1))
  WHERE is_active = true;

-- updated_at trigger
CREATE TRIGGER trg_transcribe_settings_templates_updated_at
BEFORE UPDATE ON public.transcribe_settings_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.transcribe_settings_templates ENABLE ROW LEVEL SECURITY;

-- Admin-only management
CREATE POLICY "Admins can view templates"
  ON public.transcribe_settings_templates
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert templates"
  ON public.transcribe_settings_templates
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update templates"
  ON public.transcribe_settings_templates
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete templates"
  ON public.transcribe_settings_templates
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role full access (used by the transcribe edge function at runtime)
CREATE POLICY "Service role full access on templates"
  ON public.transcribe_settings_templates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed the default template with current hardcoded AssemblyAI parameters
INSERT INTO public.transcribe_settings_templates (name, description, config, is_active)
VALUES (
  'Default',
  'Initial seeded configuration matching the hardcoded transcribe defaults.',
  '{
    "base_url": "https://api.eu.assemblyai.com/v2",
    "speech_models": ["universal-3-pro"],
    "temperature": 0,
    "speech_threshold": 0.05,
    "speaker_labels": true,
    "multichannel": true,
    "language_detection": true,
    "language_confidence_threshold": 0.4,
    "default_strategy": "recovery",
    "recovery_prompt": "Required: Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.\n\nAlways: Transcribe speech with your best guess based on context in all possible scenarios where speech is present in the audio.",
    "review_prompt": "Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.\n\nAlways: Transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear].\nAfter the first output, review the transcript again.\nPay close attention to hallucinations, misspellings, or errors, and revise them like a computer performing spell and grammar checks.\nEnsure words and phrases make grammatical sense in sentences.",
    "disfluencies": false,
    "apply_prompt_on_diarization": false,
    "poll_interval_ms": 5000,
    "max_polls": 120
  }'::jsonb,
  true
);