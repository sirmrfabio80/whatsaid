UPDATE public.jobs
SET status = 'completed',
    error_message = NULL,
    summary_language = COALESCE(summary_language, 'it'),
    short_summary = COALESCE(
      short_summary,
      'Panoramica Questa registrazione vocale riassume le indicazioni e i consigli ricevuti riguardo all''assistenza e alle necessità del padre.'
    )
WHERE id = '7cb89d57-6fa1-4ec0-820b-8b10255a535c'
  AND status = 'failed';