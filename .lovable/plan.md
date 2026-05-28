
# Phase 7 — Policy copy refresh (Privacy Notice + Terms, solicitor pass)

## Goal
Bring `/privacy` and `/terms` up to a UK-solicitor-grade standard and align every clause with what we actually do after Phases 1–6 (UK-only access, Paddle GB, Reg. 37 consent, retention schedule, DSR self-service, cookie notice, uploader attestation, Art. 14 recipient notice, AssemblyAI EU-only). No new pages; copy + structure only.

## How it is now (gaps the rewrite must close)

**Privacy (`src/pages/Privacy.tsx` + `privacy.*` i18n keys)**
- Section 6 says AssemblyAI processes audio "in the US" — contradicts the AssemblyAI EU-only lock.
- Section 10 says "WhatSaid does not currently use cookies" — contradicts the Cookies page and the in-page Cookies block.
- No mention of UK-only availability, `profiles.country` GB requirement, or Paddle GB billing-country check.
- No mention of the Reg. 37 immediate-supply consent recorded at checkout.
- No mention of the retention schedule (`retention_config`) or automated `prune-retention` runs.
- Section 9 (rights) does not point users at the self-service DSR tools in Settings (Export / Rectification / Clear local data / Delete).
- Section 12 still says data "may be processed in the United States" — wrong post-Phase 6.
- Controller/contact details are tucked inside s13 instead of a proper "Controller and contact" section, and there's no ICO right-to-complain clause.
- The bottom Cookies and Uploader-duties blocks are hard-coded EN only — IT/FR users see English.

**Terms (`src/pages/Terms.tsx` + `terms.*` i18n keys)**
- No reference to **UK-only eligibility**.
- Refund clause (s7) does not state the **CCR 2013 Reg. 37 waiver** that the checkout consent dialog now records — solicitor's biggest flag.
- s9 AI disclaimer does not reference the uploader's Art. 6/14 duties (Phase 5) or the share-recipient notice (Phase 6).
- s11 limitation of liability has no **CRA 2015 carve-out** for non-excludable consumer rights — solicitor will require it.
- s12 (termination) does not link the retention horizons.
- No "How to complain / ADR" clause; no severability / entire-agreement boilerplate.
- No cross-links to the Cookies page or DSR tools.

## What we'll do (scope-bound)

1. **Rewrite EN copy in `src/i18n/locales/en.json`** for both `privacy.*` and `terms.*`. Keep existing key shape where possible; add new keys only where genuinely needed. Mirror the new keys in `it.json` and `fr.json` (translated, not English fallback).
2. **Light render-side changes** in `src/pages/Privacy.tsx` and `src/pages/Terms.tsx` to:
   - replace the two hard-coded EN blocks in `Privacy.tsx` (Cookies, Uploader duties) with i18n keys;
   - add the few new sections to the `sections` arrays;
   - extend the existing token approach with `<settingsLink>` and `<cookiesLink>` for inline cross-links.
3. **No schema, no edge functions, no backend changes.** Pure copy + presentation.
4. **Stable "Last updated" date** — replace `new Date()` with an `EFFECTIVE_DATE` constant per page so the date reflects the actual revision date, not the current load.
5. **Postal address**: keep email-only; add the line *"Postal address available on request to support@whatsaid.app"* in the Controller section of the Privacy Notice (and mirror in Terms s2).

## New / revised clause map

### Privacy (target structure)
1. **Controller and how to contact us** — Fabio Petito trading as WhatSaid; support@whatsaid.app; "postal address available on request"; no DPO required, no EU/UK Art. 27 representative required (state explicitly)
2. **Where WhatSaid is available — United Kingdom only** (signup/login restricted to GB; Paddle billing country must be GB)
3. What personal data we collect (current s2, refined)
4. How we use your data, with the **lawful basis** for each purpose
5. **Audio handling** — uploaded to EU-region storage, transmitted to **AssemblyAI's EU region only**, deleted from both Supabase Storage and AssemblyAI immediately after the transcript is produced
6. **Retention schedule** — short table from `retention_config` (jobs, transcripts, consent events, audit logs, DSR exports, email logs) with horizons; reference automated pruning
7. **Sub-processors** — AssemblyAI (EU), Paddle (UK/EU), Lovable Cloud (EU); link to each provider's privacy policy
8. **International transfers** — confirm no transfers outside the UK/EEA under current configuration
9. **Your rights and how to exercise them** — list all UK GDPR rights and point at the self-service tools in `/settings` (Export, Rectification, Clear local data, Delete); 1-month response SLA
10. **Right to complain to the ICO** (ico.org.uk, 0303 123 1113) — solicitor-mandated
11. **Cookies and local storage** — short summary + link to `/cookies`; PECR reg. 6 basis
12. **Your responsibilities when uploading others' voices** — Art. 6 lawful basis + Art. 14 duty (Phase 5)
13. **Notices we send on your behalf** — when you email-share a transcript we send the recipient a short Art. 14 notice on your behalf (Phase 6)
14. Children — minimum age 18 (UK consumer service)
15. Security
16. Changes to this policy — material changes notified by email to account holders
17. Effective date

### Terms (target structure)
1. Acceptance
2. Who operates WhatSaid (sole trader; controller; contact; postal on request)
3. **Eligibility — UK residents only**; 18+; you confirm your billing country is the United Kingdom
4. Service description (incl. AI disclaimer pointer)
5. Acceptable use (current s4, plus: no scraping, no reverse engineering)
6. **Credits, prices and Paddle as merchant of record** — GBP, VAT-inclusive where shown, Paddle is the seller of record
7. **Digital delivery and your Reg. 37 right to cancel** — explicit clause matching the checkout dialog:
   - You normally have 14 days to cancel a digital purchase under the Consumer Contracts Regulations 2013;
   - By confirming the consent at checkout you ask us to begin supply immediately and acknowledge you lose the right to cancel once supply begins;
   - We keep a timestamped record of that consent (`consent_events`, version pointer).
8. Refunds — pointer to `/refund-policy`; Paddle handles the mechanics
9. AI output disclaimer (current s9, tightened)
10. Your content and IP — you retain ownership; you grant us a limited licence to process for the purposes set out in the Privacy Notice
11. Account security & suspension
12. **Limitation of liability with explicit CRA 2015 carve-out** for non-excludable consumer rights (s.31, s.47, s.57, s.65), death/personal injury caused by negligence, and fraud
13. Termination & data on termination — points at the retention schedule
14. Changes to these terms
15. Governing law & jurisdiction — England & Wales
16. **How to complain / ADR** — internal route + ICO for data matters + Citizens Advice pointer for consumer disputes
17. Severability & entire agreement
18. Contact

## Files touched
- `src/i18n/locales/en.json` — rewrite `privacy` and `terms` blocks
- `src/i18n/locales/it.json` — mirror keys (translated)
- `src/i18n/locales/fr.json` — mirror keys (translated)
- `src/pages/Privacy.tsx` — extend `sections` array, remove hard-coded EN blocks, add `EFFECTIVE_DATE` constant, add `<cookiesLink>` / `<settingsLink>` / `<icoLink>` token handlers
- `src/pages/Terms.tsx` — extend `sections` array, add `<settingsLink>` / `<cookiesLink>` token handlers, add `EFFECTIVE_DATE` constant

## Out of scope
- Refund Policy page — already aligned with Paddle; flag if you want a separate solicitor pass next.
- Cookie Notice page — refreshed in Phase 4.
- Any backend, edge function, or schema change.
- A separate "Sub-processor list" page — handled inside Privacy §7.

## Verification
- `bun run build` to confirm i18n JSON parses and pages compile.
- Visual pass at `/privacy` and `/terms` in EN, then IT and FR via the language selector — confirm no raw `privacy.sXX` keys leak.
- `grep -R "processed in the US\|United States" src/i18n` returns nothing for the AssemblyAI/transfers claims (regression guard).
- Click each in-policy link (`/settings`, `/cookies`, `/refund-policy`, ICO) and confirm they resolve.
