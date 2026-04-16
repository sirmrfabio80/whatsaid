UPDATE public.jobs
SET status = 'failed',
    error_message = 'Manually cleaned up: stuck processing job from routing investigation',
    audio_deleted_at = now(),
    temp_file_path = NULL,
    assemblyai_delete_status = 'not_applicable',
    updated_at = now()
WHERE id = 'ca88df0d-3866-438c-89dc-1fb4f919700e'
  AND status = 'processing';