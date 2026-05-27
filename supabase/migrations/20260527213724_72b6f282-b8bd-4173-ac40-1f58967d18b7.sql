
CREATE TABLE public.consent_versions (
  version text PRIMARY KEY,
  consent_type text NOT NULL,
  text_en text NOT NULL,
  text_it text,
  text_fr text,
  text_hash text NOT NULL UNIQUE,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz
);
GRANT SELECT ON public.consent_versions TO authenticated;
GRANT ALL ON public.consent_versions TO service_role;
ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read consent versions"
  ON public.consent_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  consent_type text NOT NULL,
  version text NOT NULL REFERENCES public.consent_versions(version),
  package_id text,
  ip_hash text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
GRANT SELECT ON public.consent_events TO authenticated;
GRANT ALL ON public.consent_events TO service_role;
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own consents"
  ON public.consent_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all consents"
  ON public.consent_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_consent_events_user_type
  ON public.consent_events(user_id, consent_type, accepted_at DESC);

INSERT INTO public.consent_versions (version, consent_type, text_en, text_hash)
VALUES (
  'cca2013.reg37.immediate-supply.2026-05-v1',
  'cca2013.reg37.immediate-supply',
  E'I want my credits to be made available immediately after payment so I can start transcribing right away.\nI understand that, because I am requesting immediate supply, I will lose my statutory 14-day right to cancel under the Consumer Contracts Regulations 2013 once those credits are credited to my account.\nWhatSaid credits are digital content supplied to you as soon as your payment is confirmed. Under regulation 37 of the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, the 14-day cancellation right does not apply to digital content once supply has begun, provided you have given your express consent and acknowledged that you will lose that right. Unused full credit packs remain refundable on request within 14 days — see our Refund Policy for details.',
  '88a338401f3d0e7b'
);
