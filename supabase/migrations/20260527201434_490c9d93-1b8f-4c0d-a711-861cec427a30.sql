UPDATE public.transcribe_settings_templates
SET config = (config - 'geo_routing_enabled' - 'us_base_url' - 'base_url')
             || jsonb_build_object('base_url', 'https://api.eu.assemblyai.com/v2'),
    updated_at = now();