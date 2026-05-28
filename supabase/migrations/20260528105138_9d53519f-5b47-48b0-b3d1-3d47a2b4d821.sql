
CREATE TABLE public.recipient_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  recipient_email_hash text NOT NULL,
  channel text NOT NULL,
  notice_type text NOT NULL,
  notice_version text NOT NULL REFERENCES public.consent_versions(version),
  message_id text,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, recipient_email_hash, notice_version)
);

GRANT SELECT ON public.recipient_notifications TO authenticated;
GRANT ALL ON public.recipient_notifications TO service_role;

ALTER TABLE public.recipient_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Uploaders view their notifications"
  ON public.recipient_notifications FOR SELECT TO authenticated
  USING (auth.uid() = shared_by);

CREATE POLICY "Admins view all notifications"
  ON public.recipient_notifications FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_recipient_notifications_shared_by_at
  ON public.recipient_notifications(shared_by, notified_at DESC);
CREATE INDEX idx_recipient_notifications_job
  ON public.recipient_notifications(job_id);

INSERT INTO public.consent_versions (version, consent_type, text_en, text_hash)
VALUES (
  'share_recipient_notice.2026-05-v1',
  'share_recipient_notice',
  E'Privacy notice — about this shared recording\n\nYou are receiving this email because someone used WhatSaid to share an audio transcript with you. Under Article 14 of the UK GDPR, we are telling you how your personal data is being handled.\n\nController. The person who shared this transcript (shown as the sender of this email) is the data controller for the recording and its transcript. WhatSaid (Lovable Cloud) acts as their processor for this delivery.\n\nPersonal data involved. Your voice recording, the resulting transcript and summary, and any names, locations or other personal details that were spoken in the recording.\n\nSource. The audio was uploaded to WhatSaid by the sender. The sender confirmed at upload time that they have a lawful basis to process the recording and to inform the people identifiable in it.\n\nPurposes and lawful basis. The transcript was produced to support the sender''s stated purpose (for example: meeting notes, interview record, personal reference). The sender''s declared lawful basis under UK GDPR Article 6 applies to that processing.\n\nRecipients. This notice and the transcript are sent only to the named recipient of this email. WhatSaid does not share the recording with any third party other than its speech-to-text and AI post-processing providers acting under contract.\n\nRetention. The transcript remains in the sender''s WhatSaid account under WhatSaid''s published retention schedule. The original audio is deleted from WhatSaid immediately after processing. If you accept this share into your own account, your copy follows your own retention.\n\nYour rights. You have the right to ask for access, rectification, erasure, restriction, or to object to this processing. You can also lodge a complaint with the UK Information Commissioner''s Office (ico.org.uk). To exercise these rights, reply to this email to contact the sender directly, or contact WhatSaid at privacy@whatsaid.app and we will forward your request to the controller.\n\nMore information. See https://whatsaid.app/privacy/share-notice for the full notice.',
  'shareneticev1.2026-05'
)
ON CONFLICT (version) DO NOTHING;
