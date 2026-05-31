/**
 * Share-uploader attestation (Phase 2) — frontend constants.
 *
 * The literal text below MUST match the EN text of the row keyed by
 * SHARE_ATTESTATION_VERSION in `public.consent_versions`. It is the
 * legally-binding warranty shown to the sender when they opt-in to
 * including the transcript content in the email body.
 *
 * Legal copy is rendered in English only by design — see the
 * "legal-binding English" project rule.
 */

export const SHARE_ATTESTATION_TYPE = "share_uploader_attestation";
export const SHARE_ATTESTATION_VERSION =
  "share_uploader_attestation.2026-06-v1";

export const SHARE_ATTESTATION_TEXT =
  "By including the transcript content in the email body to this recipient, I confirm that: " +
  "(a) I have a lawful basis under UK GDPR Article 6 to share this content with the named recipient; " +
  "(b) where the content includes special-category personal data (UK GDPR Article 9) — for example " +
  "health, political opinions, religious beliefs, sexual orientation, biometric or genetic data, " +
  "racial or ethnic origin, trade-union membership — I hold an appropriate Article 9 condition (and, " +
  "where applicable, a DPA 2018 Schedule 1 paragraph and Appropriate Policy Document) that covers " +
  "onward disclosure of this content to this recipient; (c) this onward disclosure is within the " +
  "recipient's reasonable expectations and is not for any further redistribution; and (d) WhatSaid " +
  "acts as a processor for this share and is not responsible for the lawfulness of the underlying " +
  "disclosure. A link-only share remains available as the privacy-preserving default.";
