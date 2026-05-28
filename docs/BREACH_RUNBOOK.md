# WhatSaid — Personal Data Breach Runbook

**Owner:** Fabio Petito (sole controller) · **Last reviewed:** 28 May 2026

This runbook operationalises our UK GDPR Art. 33/34 and PECR reg. 5A duties.
It is the playbook to follow the moment a personal-data incident is suspected.

---

## 0. What counts as a "personal data breach"

UK GDPR Art. 4(12): *"a breach of security leading to the accidental or
unlawful destruction, loss, alteration, unauthorised disclosure of, or
access to, personal data."*

That includes — non-exhaustively:

- Confidentiality: unauthorised access to transcripts, profiles, emails,
  credit balances, consent ledger, sub-processor data.
- Integrity: corruption of `jobs`, `job_outputs`, `consent_events`,
  `usage_events`, or any other PII-bearing row.
- Availability: prolonged inability of users to access their own data
  (extended outage, ransomware, accidental mass deletion, lost backups).
- Sub-processor incident: AssemblyAI, Paddle, Lovable Cloud (Supabase),
  OpenAI or Google notifying us of an incident affecting our data.

**A "near miss" without confirmed personal-data impact still goes into
the incident log (Art. 33(5) accountability) but does not trigger the
72h ICO clock.**

---

## 1. Roles

| Role | Who | Responsibility |
|------|-----|----------------|
| Incident lead | Fabio Petito | Owns the timeline, the decision to notify, and final sign-off. |
| Technical responder | Fabio Petito | Containment, forensics, restoration. |
| Communications lead | Fabio Petito | Drafts the user-facing notice, ICO submission, sub-processor liaison. |
| Sub-processor escalation | Fabio Petito | Contacts the affected sub-processor through their published security channel. |

Single-operator service: all hats are worn by the controller. The runbook
remains valid for any future expansion of the team — re-assign rows.

---

## 2. The clocks

| Trigger | Statute | Deadline | Who we notify |
|---|---|---|---|
| Personal-data breach with risk to rights/freedoms | UK GDPR Art. 33 | **72h from awareness** | ICO |
| Personal-data breach with **high** risk to rights/freedoms | UK GDPR Art. 34 | **Without undue delay** | Affected data subjects |
| PECS provider incident (not us today — listed for completeness) | PECR reg. 5A | 24h from detection | ICO |
| Sub-processor notifies us of an incident affecting our data | Art. 28(3)(f) / DPA | **Without undue delay** internally; then assess Art. 33/34 | Same as above |

"Awareness" starts when the controller has a reasonable degree of
certainty that a security incident has occurred and led to personal data
being compromised — not when an alert first fires.

---

## 3. Severity triage

| Sev | Examples | Default response |
|---|---|---|
| **S1 — Critical** | Confirmed exfiltration of transcripts or credentials; mass account takeover; loss of audio bucket; ransomware. | Treat as high-risk under Art. 34. Notify ICO + users. |
| **S2 — Major** | Confidentiality breach affecting >1 user but bounded; integrity loss of consent ledger or usage ledger; extended outage >24h preventing DSR access. | Notify ICO under Art. 33. Decide on Art. 34 case-by-case. |
| **S3 — Minor** | Single misdirected email containing a transcript share; isolated bug that briefly exposed a user's own data to themselves; recoverable corruption. | Log under Art. 33(5). Notify the individual if their data was disclosed. |
| **S4 — Near miss** | Vulnerability found and patched before exploitation; failed access attempt blocked by RLS. | Log only; review controls. |

---

## 4. Response phases

### 4.1 Detect (T+0)

Sources that can raise an incident:

- Sentry / runtime error spikes (`runtime-errors` knowledge file).
- Supabase Cloud status (`cloud_status` tool) flipping to `ACTIVE_UNHEALTHY`,
  `INIT_FAILED`, etc.
- Admin → Diagnostics tab (`SecurityHeadersTab`, `EdgeHealthTab`) anomalies.
- Admin → Retention Monitor showing the sweeper missed >1 day.
- A user, researcher, sub-processor or law-enforcement contact.
- `retention_alerts` / `seo_monitoring_alerts` rows flipping to critical.

**Action:** open an incident note in `/tmp/incident-YYYYMMDD-HHMM.md`
with the timeline. The first entry is "T+0: source = …; raw signal = …".

### 4.2 Contain (target: within 1h of awareness)

Choose the smallest action that stops the bleeding:

1. **Auth / takeover**: rotate `SUPABASE_SECRET_KEYS`,
   `LOVABLE_API_KEY`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
   `ASSEMBLYAI_API_KEY`, and `CONSENT_IP_SALT_SECRET` as relevant. Force
   sign-out of the affected user(s) via Supabase Auth admin.
2. **Data exposure via RLS**: disable the offending policy / function
   immediately with a hot migration; re-enable behind a fixed policy.
3. **Sub-processor incident**: revoke the API key on their side, rotate
   ours, suspend the affected edge function (`supabase config.toml` →
   set the function to a 503 shim, or delete + redeploy).
4. **Audio leak**: empty the `temp-audio` bucket, run
   `prune-retention` manually, fan out AssemblyAI DELETEs via the
   `cleanup-assemblyai` function.

### 4.3 Assess (within 24h)

For each affected user / data category, record:

- What personal data is involved? (transcript content, email, country,
  consent record, credit balance, payment reference, IP hash, audio file.)
- How many data subjects?
- What are the likely consequences? (identity theft, reputational harm,
  loss of confidentiality, financial loss, distress.)
- What controls were in place? (encryption at rest, RLS, audit log,
  short TTLs.)
- Is the risk **low**, **risk to rights/freedoms**, or **high**?

Document the decision rationale — Art. 5(2) accountability still applies
when the decision is "no notification required".

### 4.4 Notify

**ICO (Art. 33) — within 72h of awareness if risk ≥ "risk to rights/freedoms":**

- Use the ICO online reporting form:
  <https://ico.org.uk/for-organisations/report-a-breach/>.
- Include: nature of the breach, categories and approximate numbers of
  data subjects and records, contact point, likely consequences, measures
  taken or proposed.
- If full information is not yet available, file in phases (Art. 33(4))
  and update the case as facts firm up.

**Data subjects (Art. 34) — without undue delay if risk is "high":**

- Channel: transactional email (`send-transactional-email`) using a
  dedicated `user-breach-notice.tsx` template (create per incident).
- Plain English, no jargon, in the user's `ui_language` where possible.
- Must include: nature of the breach, contact point, likely consequences,
  measures taken, recommended user actions (password reset, vigilance for
  phishing using their disclosed email).
- If individual notification is disproportionate, use a public banner on
  `/` plus a press notice (Art. 34(3)(c)).

**Sub-processors / partners:** when our incident was caused or amplified
by them, formally notify them in writing per the Art. 28 contract.

### 4.5 Recover

- Restore from backups (Lovable Cloud retains automated backups; restore
  via Connectors → Lovable Cloud).
- Verify integrity of `jobs`, `consent_events`, `usage_events`,
  `credit_transactions`, `dsr_requests` and `retention_config`.
- Re-run `prune-retention` and `cleanup-assemblyai` to confirm
  lifecycle controls are operational again.
- Re-enable any temporarily disabled edge functions.

### 4.6 Learn

Within **2 weeks** of closure:

- Write a public post-mortem (no PII) covering: what happened, impact,
  timeline, root cause, fix, prevention.
- Update this runbook with anything you wish you had known.
- Add a regression test (e.g. an RLS or headers test like
  `headers-framing.test.ts`) to make the failure mode impossible.
- Update Privacy / Cookies / Terms if the incident exposed an inaccuracy.

---

## 5. The incident log

Maintain a single, append-only spreadsheet (CSV in
`/mnt/documents/incidents.csv`) with columns:

`id, opened_at, severity, summary, sub_processor, affected_users,
data_categories, ico_notified_at, users_notified_at, closed_at,
post_mortem_url`.

Required by Art. 33(5) even for incidents that did not need to be
reported to the ICO.

---

## 6. Contact card

| Contact | Address | Notes |
|---|---|---|
| ICO breach reporting | <https://ico.org.uk/for-organisations/report-a-breach/> | Online form is the primary channel. Phone 0303 123 1113 for urgent. |
| ICO helpline | 0303 123 1113 | For pre-notification guidance. |
| Lovable Cloud security | support via Lovable platform | Sub-processor (managed Supabase / hosting). |
| Supabase security | <security@supabase.com> | Underlying processor; surface through Lovable. |
| AssemblyAI security | <security@assemblyai.com> | EU endpoint only — note our endpoint in any report. |
| Paddle support | <https://www.paddle.com/help> | Merchant of record. |
| OpenAI security | <https://openai.com/security/> | Post-processing model provider via Lovable AI Gateway. |
| Google (Gemini) security | <https://cloud.google.com/security> | Post-processing model provider via Lovable AI Gateway. |
| Internal users | banner on `/` + `send-transactional-email` template | When Art. 34 applies. |

---

## 7. Annual review

This runbook is reviewed at least once per year and after every
incident. The review is recorded in `docs/ARCHITECTURE.md` under
"Operational reviews". Next review due: **28 May 2027**.
