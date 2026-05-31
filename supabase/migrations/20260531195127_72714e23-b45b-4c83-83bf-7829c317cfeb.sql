
-- Phase 0: Transcript-share remediation v3 migration
-- See .lovable/plan.md (Phase 0).
--
-- Decisions documented here:
--   1. We extend transcript_shares with email_in_body + attestation_consent_event_id
--      so the sender's per-share "include in body" choice and Phase-2 attestation
--      can be audited.
--   2. Per-view audit reuses the existing public.recipient_notifications table
--      (same shape: job_id, shared_by, recipient_email_hash, notice_type/version,
--      message_id). We add two new `channel` values ('in_app_modal', 'view')
--      instead of creating a parallel transcript_share_views table.
--   3. The existing unique index (job_id, recipient_email_hash, notice_version)
--      is replaced with one that also includes `channel`, so the in-app modal
--      ack de-dupes per channel while per-view rows can repeat.
--   4. A new consent version row 'share_uploader_attestation.2026-06-v1' is
--      seeded (English only). We do NOT mint a new recipient_controller_notice
--      type — reuse the existing 'share_recipient_notice.2026-05-v1'.

-- 1. transcript_shares: email_in_body + attestation FK
ALTER TABLE public.transcript_shares
  ADD COLUMN IF NOT EXISTS email_in_body boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attestation_consent_event_id uuid
    REFERENCES public.consent_events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transcript_shares.email_in_body IS
  'Phase 2: sender opted to include transcript content in the email body. Default false (link-only).';
COMMENT ON COLUMN public.transcript_shares.attestation_consent_event_id IS
  'Phase 2: FK to the consent_events row (share_uploader_attestation.*) when email_in_body=true.';

-- 2. recipient_notifications: allow per-channel de-dup so the same notice_version
--    can be delivered via email, surfaced in an in-app modal, and audited per view.
--    Plan: unique on (job_id, recipient_email_hash, channel, notice_version) for
--    de-dup channels; per-view rows are exempt (they intentionally repeat).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recipient_notifications_job_id_recipient_email_hash_notice__key'
      AND conrelid = 'public.recipient_notifications'::regclass
  ) THEN
    ALTER TABLE public.recipient_notifications
      DROP CONSTRAINT recipient_notifications_job_id_recipient_email_hash_notice__key;
  END IF;
END $$;

-- Partial unique index: de-dup only the channels that should be one-shot.
-- 'view' rows are intentionally allowed to repeat (per-view audit trail).
CREATE UNIQUE INDEX IF NOT EXISTS recipient_notifications_dedup_idx
  ON public.recipient_notifications (job_id, recipient_email_hash, channel, notice_version)
  WHERE channel IN ('email', 'in_app_modal');

-- Supporting index for per-view audit queries.
CREATE INDEX IF NOT EXISTS recipient_notifications_view_audit_idx
  ON public.recipient_notifications (job_id, notified_at DESC)
  WHERE channel = 'view';

COMMENT ON COLUMN public.recipient_notifications.channel IS
  'Delivery channel for the notice. Known values: email, in_app_modal, view. '
  'email + in_app_modal are de-duped per (job, recipient, channel, version); '
  'view rows intentionally repeat for per-view audit.';

-- 3. Seed the new uploader-attestation consent version (English only per plan).
INSERT INTO public.consent_versions (
  version,
  consent_type,
  text_en,
  text_hash,
  effective_from
)
VALUES (
  'share_uploader_attestation.2026-06-v1',
  'share_uploader_attestation',
  'By including the transcript content in the email body to this recipient, I confirm that: '
    || '(a) I have a lawful basis under UK GDPR Article 6 to share this content with the named recipient; '
    || '(b) where the content includes special-category personal data (UK GDPR Article 9) — for example health, '
    || 'political opinions, religious beliefs, sexual orientation, biometric or genetic data, racial or ethnic origin, '
    || 'trade-union membership — I hold an appropriate Article 9 condition (and, where applicable, a DPA 2018 Schedule 1 '
    || 'paragraph and Appropriate Policy Document) that covers onward disclosure of this content to this recipient; '
    || '(c) this onward disclosure is within the recipient''s reasonable expectations and is not for any further redistribution; '
    || 'and (d) WhatSaid acts as a processor for this share and is not responsible for the lawfulness of the underlying disclosure. '
    || 'A link-only share remains available as the privacy-preserving default.',
  encode(digest(
    'share_uploader_attestation.2026-06-v1::v1::By including the transcript content in the email body…',
    'sha256'
  ), 'hex'),
  now()
)
ON CONFLICT (version) DO NOTHING;
