/**
 * Reg. 37 (CCA 2013) consent — frontend constants.
 *
 * The literal text below MUST match the EN text of the row keyed by
 * REG37_CONSENT_VERSION in `public.consent_versions`. Both strings are the
 * legally-binding consent the user sees in the checkout dialog. Editing them
 * without seeding a new `consent_versions` row will cause `record-consent` to
 * reject the request (the version's `consent_type` lookup still resolves, but
 * the seeded text no longer matches what was shown — fix by inserting a new
 * version row and bumping `REG37_CONSENT_VERSION`).
 */

export const REG37_CONSENT_TYPE = "cca2013.reg37.immediate-supply";
export const REG37_CONSENT_VERSION =
  "cca2013.reg37.immediate-supply.2026-05-v1";

export const REG37_CHECKBOX_IMMEDIATE_SUPPLY =
  "I want my credits to be made available immediately after payment so I can start transcribing right away.";

export const REG37_CHECKBOX_RIGHT_LOSS =
  "I understand that, because I am requesting immediate supply, I will lose my statutory 14-day right to cancel under the Consumer Contracts Regulations 2013 once those credits are credited to my account.";

export const REG37_EXPLANATORY =
  "WhatSaid credits are digital content supplied to you as soon as your payment is confirmed. Under regulation 37 of the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, the 14-day cancellation right does not apply to digital content once supply has begun, provided you have given your express consent and acknowledged that you will lose that right. Unused full credit packs remain refundable on request within 14 days — see our Refund Policy for details.";
