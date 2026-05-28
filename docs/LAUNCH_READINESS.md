# WhatSaid — UK launch readiness

> Plain-English companion to `docs/ARCHITECTURE.md`. Written for legal
> reviewers (solicitor / DPO) rather than engineers. The technical map
> of the same phases lives in §11 of the architecture document.

---

## 1. Executive summary

**WhatSaid** is a pay-as-you-go web application that converts uploaded
audio recordings (`.m4a`, `.mp3`, `.wav`, up to 100 MB and 8 hours)
into a transcript, a structured summary with key actions, and answers
to custom prompts. There is no subscription. A user buys "credits" and
each credit covers one transcription up to 2 hours of audio
(£4.99 single / £14.99 5-pack / £39.99 20-pack, GBP, VAT-inclusive
where applicable; Paddle.com Market Limited is the merchant of
record).

**Who can use it.** The service is available **only to United Kingdom
residents (country code GB)**. Eligibility is enforced in four
independent places: signup, login, the database (`profiles.country`
column with an immutability trigger) and at checkout (Paddle billing
country must be GB; non-GB transactions are rejected by the webhook).
A user whose source IP region cannot be determined is treated as
non-GB ("fail-closed").

**Where data lives.** All personal data, transcripts, and short-lived
audio files are stored in Lovable Cloud (EU region). Audio is sent to
AssemblyAI's **EU region only** for speech-to-text, and is deleted
from both Supabase storage and AssemblyAI as soon as the transcript
has been produced. Generated text (transcript, summary, custom-prompt
answers, tags, title, metadata) is retained on the user's account
until they delete it or request erasure.

**Who touches the data.** Three sub-processors only: AssemblyAI (EU)
for speech-to-text, Lovable Cloud / Supabase (EU) for hosting and
storage, and Paddle (UK/EU) for billing. There are no analytics,
marketing or third-party advertising trackers.

**Legal frame.** UK GDPR, Data Protection Act 2018, PECR (cookies),
Consumer Contracts (Information, Cancellation and Additional Charges)
Regulations 2013 (Reg. 37 immediate-supply consent), Consumer Rights
Act 2015 (statutory rights carve-out in the Terms), and the Equality
Act 2010 (accessibility statement and reasonable-adjustment route).

The data controller is **Fabio Petito trading as WhatSaid**. Contact:
**support@whatsaid.app** — postal address available on request.

---

## 2. What is published and live

| Surface | Where users see it | Status |
|---|---|---|
| Privacy Notice | `/privacy` | **Live**, effective **28 May 2026** |
| Terms of Service | `/terms` | **Live**, effective **28 May 2026** |
| Refund Policy | `/refund-policy` | Live |
| Cookie Notice & inventory | `/cookies` (linked from footer and Privacy §11) | Live |
| Accessibility Statement | `/accessibility` (linked from footer) | Live |
| Reg. 37 immediate-supply consent | Two-checkbox dialog before every Paddle checkout; the consent ID is verified by the payment webhook | Live |
| Uploader lawful-basis attestation | One-checkbox dialog before every audio upload (Art. 6 / 14 duty) | Live |
| Share-recipient Art. 14 notice | Short "told-once" notice embedded in every shared-transcript email and on the claim page | Live |
| DSR self-service (Art. 15 / 16 / 20) | `/settings → Your data` card: Export, Rectification, Clear local data, Delete | Live |
| UK-only eligibility | Signup, login, invite redemption, and Paddle checkout all gated to GB | Live |
| EU-only audio processing | AssemblyAI host pinned to `api.eu.assemblyai.com` end-to-end | Live |

---

## 3. Mandatory-to-publish — open items

These are launch-blocking only if you treat them as strictly mandatory
before going live publicly. Each line is a concise question the
business owner needs to answer; none requires engineering work in
this PR.

- **ICO data-protection fee.** Confirm registration / annual fee
  status with the Information Commissioner's Office (`ico.org.uk`).
- **Trading-name / business identity disclosure.** Add a one-line
  "Fabio Petito trading as WhatSaid, sole trader, United Kingdom"
  block on a public Contact page or in the footer (currently only in
  Privacy §1 and Terms §2).
- **Postal address on request.** Decide who owns the postal-address-on-
  request channel (currently `support@whatsaid.app`) and the response SLA.
- **Complaints SLA.** Privacy says the controller will respond to
  rights requests within one month; confirm the internal process and
  document the escalation path to the ICO.
- **Standalone sub-processor list.** Today the sub-processor list
  lives inside Privacy §7. Consider a dedicated `/sub-processors` page
  if a future enterprise/legal request asks for one.

---

## 4. Data flow

```
                ┌─────────────────────────────────────┐
                │ UK resident (GB IP, GB billing)      │
                └──────────────────┬───────────────────┘
                                   │ HTTPS
                                   ▼
                ┌─────────────────────────────────────┐
                │ Lovable Cloud (EU region)            │
                │  • Auth, Postgres, private Storage   │
                └─────┬────────────────────┬───────────┘
                      │                    │
            audio file│                    │ generated
            (≤8 h)    │                    │ text
                      ▼                    ▼
        ┌──────────────────────┐   ┌──────────────────────┐
        │ AssemblyAI (EU only) │   │ Lovable AI Gateway   │
        │  speech-to-text       │   │  summary / Q&A / tags│
        └──────────┬───────────┘   └──────────────────────┘
                   │ transcript text
                   ▼
        ┌──────────────────────┐
        │ Audio file DELETED    │
        │ from both providers   │
        │ once transcript ready │
        └──────────────────────┘

       (Billing path runs separately via Paddle, GB only.)
```

The audio file never leaves the UK / EEA. Only text and metadata
persist on the user's account.

---

## 5. Retention schedule

Active retention horizons, read directly from the live
`retention_config` table on 28 May 2026:

| Dataset | Horizon | Strategy | Legal basis |
|---|---|---|---|
| Reg. 37 / upload / share-recipient consent records (`consent_events`) | 6 years | Anonymise after horizon | Contract defence (limitation period) |
| AI & share usage ledger (`usage_events`) | 90 days | Delete | Legitimate interest (quota enforcement) |
| Transactional email delivery logs (`email_send_log`) | 180 days | Delete | Legitimate interest (deliverability + dispute handling) |
| Storage cleanup run logs (`cleanup_logs`) | 30 days | Delete | Legitimate interest (operations) |
| Finished async background jobs (`async_jobs_finished`) | 30 days | Delete | Legitimate interest (operations) |
| Portability ZIPs (`dsr_exports` bucket) | 7 days | Delete | Operational — short-lived download artefact only |
| Credit ledger entries (`credit_transactions`) | 6 years (retained — sweep currently disabled) | n/a | Contract + UK tax record-keeping (HMRC) |

Audio files themselves are never on this schedule — they are deleted
immediately after the transcript is produced and the `audio_deleted_at`
field on the job record is set.

The schedule is administered from `/admin → Retention` and is
swept daily by a background task (`prune-retention`) with a monitor
that alerts the operator if a run fails or behaves anomalously.

---

## 6. User rights and how to exercise them

Every user can do the following from **Settings → Your data**
without raising a support ticket:

- **Access / portability (Art. 15 / 20).** "Download my data" produces
  a ZIP containing profile, credit balance and transactions, jobs,
  outputs, tags, shares sent, recent usage events, notifications and
  consent records. The download link is valid for 7 days, then both
  the link and the underlying file are removed.
- **Rectification (Art. 16).** A short form lets the user request a
  correction to their email or country. Each request is logged and
  an admin is notified.
- **Erasure (Art. 17).** A standard "Delete my account" button removes
  the account and cascades to all owned data.
- **Cookie / local-storage control.** A "Clear local data" button
  removes functional cookies and `localStorage` keys while keeping
  the active session intact.
- **Reg. 37 record.** The exact timestamped consent the user gave at
  checkout is included in the portability ZIP.

If a user is unhappy with how a request has been handled they can
complain to the **Information Commissioner's Office**
(`ico.org.uk` / 0303 123 1113). The Privacy Notice states this
explicitly.

---

## 7. Phase ledger

Each row corresponds to a piece of work that took WhatSaid from a
generic transcription app to a UK-launch-ready service. Where a phase
shipped across more than one merge, the first anchor SHA is listed.

| # | Phase | Live since (commit) | Where the user feels it |
|---|---|---|---|
| 1 | Reg. 37 immediate-supply consent at checkout | `e982ec4` | Two-checkbox dialog before paying |
| 2 | Retention schedule + automated pruning | `300bff9` | Nothing visible — operational |
| 3 | DSR self-service (Art. 15 / 16 / 20) | `61f8bd6` | "Your data" card in Settings |
| 4 | Cookie notice + inventory | `c60f25d` | `/cookies` page + footer link + "Clear local data" |
| 5 | Uploader lawful-basis attestation | `76cba4f` | Pre-upload one-checkbox dialog |
| 6 | Share-recipient Art. 14 notice | `18670f1` | Notice block in shared-transcript emails and on the claim page |
| 7 | Privacy + Terms refresh (UK-solicitor pass) | `9660e27` | New `/privacy` and `/terms`, effective 28 May 2026 |
| 8 | WCAG 2.2 AA statement + accessibility audit | `7292b89` | `/accessibility` page + footer link + aria fixes |

For the table / function / RLS detail of any row above, see §11 of
`docs/ARCHITECTURE.md`.
