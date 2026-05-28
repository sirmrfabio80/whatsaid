
-- Phase 5: uploader lawful-basis attestation

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS upload_consent_id uuid;

CREATE INDEX IF NOT EXISTS idx_jobs_upload_consent_id
  ON public.jobs(upload_consent_id);

-- Extend the billing-columns lock trigger to also lock upload_consent_id post-insert.
CREATE OR REPLACE FUNCTION public.lock_jobs_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'jobs.user_id is immutable from the client';
  END IF;
  IF NEW.credits_charged IS DISTINCT FROM OLD.credits_charged THEN
    RAISE EXCEPTION 'jobs.credits_charged is immutable from the client';
  END IF;
  IF NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN
    RAISE EXCEPTION 'jobs.duration_seconds is immutable from the client';
  END IF;
  IF NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
    RAISE EXCEPTION 'jobs.file_size_bytes is immutable from the client';
  END IF;
  IF NEW.file_name IS DISTINCT FROM OLD.file_name THEN
    RAISE EXCEPTION 'jobs.file_name is immutable from the client';
  END IF;
  IF NEW.guest_token IS DISTINCT FROM OLD.guest_token THEN
    RAISE EXCEPTION 'jobs.guest_token is immutable from the client';
  END IF;
  IF NEW.upload_consent_id IS DISTINCT FROM OLD.upload_consent_id THEN
    RAISE EXCEPTION 'jobs.upload_consent_id is immutable from the client';
  END IF;

  RETURN NEW;
END;
$function$;

-- Seed the upload_lawful_basis consent version 1.0.0.
INSERT INTO public.consent_versions (consent_type, version, text_en, text_it, text_fr, text_hash)
VALUES (
  'upload_lawful_basis',
  '1.0.0',
  'I confirm I have a lawful basis under UK GDPR Article 6 to upload this audio for transcription (for example: it is my own voice, the speakers have given consent, it is necessary for a contract, or another lawful ground applies). Where the recording contains identifiable people other than me, I will inform them their voice is being transcribed by WhatSaid, unless an Article 14(5) exemption applies. I understand WhatSaid deletes the audio file immediately after the transcript is produced.',
  'Confermo di avere una base giuridica ai sensi dell''art. 6 del GDPR del Regno Unito per caricare questo audio per la trascrizione (ad esempio: è la mia voce, gli interlocutori hanno dato il consenso, è necessario per un contratto o si applica un''altra base giuridica). Quando la registrazione contiene persone identificabili diverse da me, le informerò che la loro voce viene trascritta da WhatSaid, salvo eccezioni ai sensi dell''art. 14(5). Comprendo che WhatSaid elimina il file audio immediatamente dopo la generazione della trascrizione.',
  'Je confirme disposer d''une base légale au sens de l''article 6 du UK GDPR pour téléverser cet enregistrement à des fins de transcription (par exemple : il s''agit de ma propre voix, les interlocuteurs ont donné leur consentement, c''est nécessaire à un contrat, ou un autre fondement légal s''applique). Lorsque l''enregistrement contient des personnes identifiables autres que moi, je les informerai que leur voix est transcrite par WhatSaid, sauf si une exemption au titre de l''article 14(5) s''applique. Je comprends que WhatSaid supprime le fichier audio immédiatement après la production de la transcription.',
  encode(digest('upload_lawful_basis|1.0.0|en', 'sha256'), 'hex')
)
ON CONFLICT DO NOTHING;
