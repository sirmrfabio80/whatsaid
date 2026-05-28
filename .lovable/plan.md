# WhatSaid — UK Compliance Audit (verified against `uk-data-law` skill)

Read-only audit. Each finding now cites the specific UK statute / Article it engages, using the skill's four-Parts routing model (all WhatSaid processing is **Part 2 — general processing under UK GDPR**, supplemented by DPA 2018).

---

## Sev 1 — Immediate legal / operational risk

### S1-A. Storage limitation not enforced — no pg_cron schedule for retention sweepers
- **Where**: `supabase/migrations/*` — no `cron.schedule(...)` for `prune-retention`, `cleanup-assemblyai`, `cleanup-expired-shares`, or `retention-monitor-watchdog`. Only the email_infra migration installs pg_cron jobs.
- **Engages**: **UK GDPR Art. 5(1)(e)** (storage limitation) + **Art. 5(2)** (accountability — must *demonstrate* compliance, not just declare it). Tier-1 penalty exposure under **DPA 2018 s.157** (£17.5M / 4%).
- **Why it's Sev 1**: `retention_config` declares horizons but a control that never runs is — per the skill's accountability framing — not a control. AssemblyAI EU still holds transcripts past horizon, breaching the Art. 28 sub-processor expectation that "deletion/return" actually happens.
- **Fix**: Add pg_cron schedules in a new migration (daily for prune-retention/cleanup-assemblyai/cleanup-expired-shares; every 15 min for retention-monitor-watchdog) via `net.http_post` with service-role key — per the Lovable scheduling pattern.

### S1-B. Privacy page does not list sub-processors / recipients
- **Where**: `src/pages/Privacy.tsx` — zero hits for `assemblyai|paddle|lovable|openai|google|sub-process|processor|recipient`.
- **Engages**: **UK GDPR Art. 13(1)(e)** ("recipients or categories of recipients of the personal data") and **Art. 14(1)(e)** for data obtained from uploaders about third parties (speakers in recordings). Skill's Art. 28 framing also requires the controller to identify processors transparently.
- **Sub-processors that must be named**: AssemblyAI (Ireland, EU endpoint), Paddle (merchant of record, IoM/US), Lovable Cloud / Supabase (EU), Lovable AI Gateway routing to OpenAI (US, DPF) and Google (US, DPF). Each is an **international transfer route** under Chapter V and needs its safeguard named per the skill's "don't stack mechanisms without naming the active one per route" rule.
- **Fix**: Add a §"Who we share data with" table with role, country, lawful basis, and Chapter V mechanism per recipient. Mirror in `docs/ARCHITECTURE.md`.

### S1-C. `paddle-webhook` missing from `supabase/config.toml` (verify_jwt default = true)
- **Where**: `supabase/config.toml` — no block for `paddle-webhook`.
- **Engages**: Operational reliability of the lawful basis for billing (**Art. 6(1)(b)** — contract). If webhooks silently fail at the platform JWT check, credits are never granted, the contract is not performed, and refund duties under **CRA 2015 s.46** kick in.
- **Fix**: Add `[functions.paddle-webhook]\nverify_jwt = false` so HMAC verification (already implemented) is the sole authentication.

### S1-D. `create-job/index.ts` — orphan `try/catch` fragment
- **Where**: `supabase/functions/create-job/index.ts:123–127`.
- **Engages**: Service availability — not a data-law breach per se, but a cold-start failure here blocks every upload, which would cascade into DSAR backlog (Art. 15, 1-month clock) if users can't even complete the upload they came for.
- **Fix**: Remove the orphan block.

### S1-E. `record-consent/index.ts` — duplicate `interface Body` declaration
- **Where**: lines 10–24 — `interface Body {` appears twice with a dangling `}`.
- **Engages**: **Art. 7(1)** (controller must be *able to demonstrate* the data subject consented). If this function fails to deploy, Reg.37 consent is not recorded and the CCR 2013 statutory-right waiver collapses → refund liability under skill's CRA §9 framing.
- **Fix**: Collapse to a single interface and remove the stray brace.

### S1-F. `delete-account` is incomplete erasure
- **Where**: `supabase/functions/delete-account/index.ts` — does not delete from `consent_events`, `usage_events`, `share_artifact_log`, `recipient_notifications`, `share_pdf_cache`, `dsr_requests`, `reviews`, `help_faq_feedback`, `email_unsubscribe_tokens`; doesn't purge `temp-audio/<uid>/` or `dsr-exports/<uid>/`; doesn't fan-out AssemblyAI DELETE for any `assemblyai_delete_status IN ('pending','failed')` rows before dropping jobs.
- **Engages**: **UK GDPR Art. 17** (right to erasure) + **Art. 28(3)(g)** (processor must delete on controller instruction — AssemblyAI is reachable, we just don't call it). Tier-1 fine exposure.
- **Note (Sch. 2 carve-outs)**: Email suppression tokens *could* be retained on a "legal obligation / legitimate interests in honouring unsubscribe" basis (skill ch06 / Sch.2), but the current code keeps them by accident, not by documented decision. Either delete or document the basis in an Appropriate Policy Document.
- **Fix**: Fan-out AssemblyAI DELETE → delete all PII tables → purge `temp-audio` + `dsr-exports` buckets → then delete user.

### S1-G. `prune-retention` accepts an unverified JWT `role=service_role` claim
- **Where**: `supabase/functions/prune-retention/index.ts:136–139` — reads `payload.role === "service_role"` from the raw JWT without `auth.getUser()`.
- **Engages**: **Art. 5(1)(f)** (integrity & confidentiality) + **Art. 32** (security of processing). A forged unsigned JWT would let an attacker trigger destructive sweeps. Tier-1 fine exposure.
- **Fix**: Add `[functions.prune-retention]\nverify_jwt = true` and only trust admin via `admin.auth.getUser(token)` + `has_role('admin')`; drop the claim-trusting branch.

### S1-H. `paddle-webhook` does not enforce `consent_version` match
- **Where**: `supabase/functions/paddle-webhook/index.ts:263–267` — logs `console.warn` on drift and proceeds.
- **Engages**: **Reg. 37 CCR 2013** + **Art. 7(2)** (consent must be presented in a clearly distinguishable form). If the buyer saw consent text vN-1 but we credit a purchase under vN, the legal record on file no longer matches what they agreed to — the 14-day-right waiver is voidable.
- **Fix**: Return 200 `{ignored:"consent_version_drift"}` + admin alert; require an explicit re-consent.

---

## Sev 2 — Material gap

### S2-A. `Signup.tsx` hardcodes `country: "GB"` in auth metadata regardless of dropdown
- **Where**: `src/pages/Signup.tsx:84`.
- **Engages**: **Art. 5(1)(d)** (accuracy). The declared country is *recorded inaccurately* by design — and country drives the entire UK-only access model. If `validate-signup-country` is ever bypassed, the inaccurate stored value would falsely admit a non-GB user past `check-login-region`'s stored-country branch.
- **Fix**: Pass the selected `country` to metadata; rely on `validate-signup-country` + `lock_profile_country` trigger for immutability.

### S2-B. DSR export omits `recipient_notifications` and `dsr_requests`
- **Where**: `supabase/functions/dsr-export/builder.ts`.
- **Engages**: **Art. 15(1)** — right of access covers *all* personal data, not a curated subset. Skill's DSAR workflow note: "reasonable search" is the test; omitting two known tables fails it.
- **Fix**: Add `dsr_requests.json` (own requests) and `recipient_notifications.json` (`shared_by = user_id`) to the manifest.

### S2-C. No self-service Art. 16 rectification for `display_name`
- **Where**: `src/components/settings/DataRightsCard.tsx` + `admin_apply_rectification` RPC.
- **Engages**: **Art. 16** (rectification). Skill's framing: rectification should be reasonably easy when the controller plainly governs the field; `profiles.display_name` already has user-scoped UPDATE RLS.
- **Fix**: Allow direct UPDATE on `display_name` from Settings.

### S2-D. Refund Policy not reconciled against final Reg.37 + goodwill commitment
- **Where**: `src/pages/RefundPolicy.tsx`.
- **Engages**: **CRA 2015 Pt 2** (unfair-terms test) + **CCR 2013 Reg. 37**. Skill flags: terms that obscure the statutory waiver, or fail to set out the goodwill route, sit in the grey list under Sch.2 CRA.
- **Fix**: Reconcile copy against `mem://features/pricing`; explicitly state (a) Reg.37 waiver on credit grant, (b) unused full-pack refund window per project memory, (c) support contact.

### S2-E. `share-transcript` re-embeds the Art. 14 notice every send — undocumented
- **Where**: `supabase/functions/share-transcript/index.ts:330–334, 410–422`.
- **Engages**: **Art. 14** (information to data subjects whose data was obtained from someone other than them) — repeating the notice each share is correct policy, but undocumented behaviour invites a "bug fix" that breaks compliance. Skill's accountability principle: document the why.
- **Fix**: Comment block stating `recipient_notifications` is an audit ledger; the notice is intentionally included every send.

### S2-F. `temp-audio` and `dsr-exports` buckets not in account-deletion sweep
- **Where**: `supabase/functions/delete-account/index.ts:67` — loops only `avatars`, `shared-pdfs`, `exports`.
- **Engages**: **Art. 17** (erasure) — same Tier-1 family as S1-F but lower likelihood (these are short-lived buckets).
- **Fix**: Add both buckets to the loop.

### S2-G. `validate-signup-country` passes when IP country is unknown
- **Where**: `supabase/functions/validate-signup-country/index.ts:32–46`.
- **Engages**: Asymmetric with `check-login-region`, which fails closed. Not a UK-law breach in itself (UK eligibility is a commercial / consumer-protection choice, not a GDPR rule), but it weakens the audit trail that supports the UK-only Art. 3 territorial-scope claim.
- **Fix**: Make signup symmetric with login, OR document the asymmetry explicitly in code + privacy policy.

### S2-H. No documented breach-response runbook
- **Where**: repo-wide.
- **Engages**: **UK GDPR Art. 33(1)** — ICO notification within **72h** of awareness. Skill's breach-clock framing: without a written runbook the clock is hard to meet, and Art. 33(5) requires documenting even sub-threshold incidents.
- **Fix**: `docs/INCIDENT_RESPONSE.md` covering detection signals, severity triage, ICO portal URL, Art. 33 vs Art. 34 thresholds, and template content.

### S2-I. Reg.37 dialog wording is English-only with no documented basis
- **Where**: `src/lib/reg37-consent.ts`.
- **Engages**: **Art. 7(2)** — consent must be in "clear and plain language". For a strict UK-only deployment most buyers speak English, but Welsh-speaking consumers and EU-language UI users see legally binding text in a language they may not understand.
- **Fix**: Either force `i18n.language = "en"` on Pricing (matching `LegalEnglishOnlyBanner`), or seed reviewed `consent_versions.text_it/fr` and render them. Either choice is defensible — but it has to *be* a choice.

### S2-J. `consent_versions` RLS — any authenticated user can read all rows including future-scheduled
- **Where**: policy `Authenticated can read consent versions … USING (true)`.
- **Engages**: Not a personal-data breach (legal text is not personal data). Engages **Art. 32** principle of least privilege as a defensive measure and avoids leaking product timing.
- **Fix**: `USING (effective_from <= now() AND (effective_to IS NULL OR effective_to > now()))`.

### S2-K. Cookie consent — verify PECR reg.6 implementation matches inventory
- **Where**: `src/components/CookieNotice.tsx`, `src/lib/cookie-inventory.ts`, `src/pages/Cookies.tsx`.
- **Engages**: **PECR reg.6** — strictly necessary cookies don't need consent; everything else (analytics, advertising) does. Skill: "no pre-ticked boxes; reject as prominent as accept; cookie walls bundling non-essential cookies with access are prohibited."
- **Audit can confirm**: inventory file exists and is parity-tested. **Audit cannot confirm** from source alone: that the banner renders before any non-essential cookie is set, that Reject is visually equivalent to Accept, and that the `/cookies` page renders the full inventory (not a summary).
- **Fix**: Add a Vitest that imports `cookie-inventory` and asserts (a) every "necessary=false" cookie maps to a consent category gate in `CookieNotice`, (b) `/cookies` renders every entry. Visually verify Accept/Reject parity.

---

## Sev 3 — Best practice / future-proofing

### S3-A. `dsr-export/builder.ts` duplicated in client without CI parity check
- Add `scripts/check-dsr-builder-parity.mjs`.

### S3-B. `/cookies` page must render the full inventory (PECR transparency)
- Render every entry grouped by category with provider + retention + last-updated date.

### S3-C. Accessibility page — "report a barrier" contact + response window
- **Engages**: **Equality Act 2010 s.20** (reasonable adjustments) — skill ch10. Without a stated response window the duty is harder to evidence.
- Add `support@whatsaid.app` + 5-working-day response commitment.

### S3-D. `paddle-webhook` 200-on-guard-failure → also write to `payment_anomalies` table
- Currently relies entirely on admin email reliability.

---

## Cross-cutting items the skill highlights but the codebase already handles well

Recorded so future audits don't re-flag them:

| Skill item | WhatSaid status |
|---|---|
| **Art. 6 lawful basis per purpose** | Documented: (b) contract for credits/processing, (f) legitimate interests for fraud/anomaly, (a) consent for Reg.37 + cookies + uploads. |
| **Art. 9 special category** | Out of scope by design — speakers may *incidentally* discuss SC data but WhatSaid does not solicit or infer it. Worth a one-line privacy disclosure. |
| **Art. 28 eight clauses** | Lovable DPA (ch11 worked example) covers the controller→processor leg. AssemblyAI EU + Paddle DPAs need the same audit. |
| **Chapter V transfers** | AssemblyAI = EU (no transfer). Paddle / OpenAI / Google = US — need DPF status named in privacy policy (see S1-B). |
| **Art. 32 security** | RLS + service-role boundaries are strong; the one breach is S1-G. |
| **Art. 33 / 34 breach** | Tooling exists (retention alerts, watchdog); runbook missing (S2-H). |
| **PECR reg.22 marketing** | No outbound marketing email flow exists; only transactional + Art. 14 share notices. Skill's "soft opt-in is for existing customers only" rule is not triggered. |
| **CRA 2015 s.46** | Goodwill refund window for unused credits is in project memory; needs to land in `/refund-policy` (S2-D). |
| **Equality Act / Art. 22** | No automated decision-making with legal/significant effect — Art. 22 not engaged. |

---

## Areas the audit could not verify (need runtime / dashboard)

1. Whether `paddle-webhook` is actually receiving webhooks today (S1-C may already be biting).
2. Whether deployed bundles of `create-job` / `record-consent` match the broken source on disk (S1-D, S1-E) or were last shipped from a clean state.
3. Whether `cron.job` has hand-installed schedules invisible to migration files (S1-A).
4. Final rendered DOM of `/privacy`, `/terms`, `/refund-policy`, `/cookies`, `/accessibility` after i18n + `LegalEnglishOnlyBanner` resolution.
5. AssemblyAI-side retention compliance (no programmatic audit trail).
6. RLS behaviour under each role exercised against live data (only policies were read).

---

## Summary

| Severity | Count |
|---|---|
| Sev 1 | 8 |
| Sev 2 | 11 (added S2-K from PECR ch08) |
| Sev 3 | 4 |

**Recommended top of queue** (highest legal/operational risk first):
1. S1-A (storage limitation — schedule the sweepers)
2. S1-B (Art. 13 sub-processor disclosure)
3. S1-C / S1-D / S1-E (deployment-level correctness — paddle-webhook config + two broken edge functions)
4. S1-F + S2-F (Art. 17 erasure completeness)
5. S1-G (Art. 32 — auth hardening)
6. S1-H (Reg.37 consent-version enforcement)

Tell me which to action first and I'll switch to build mode.

Used the `uk-data-law` skill.
