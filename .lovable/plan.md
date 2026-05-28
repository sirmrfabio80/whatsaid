
# Docs refresh — split deliverable (revised)

## Goal
Bring documentation back in sync with the codebase after Phases 1–8, without conflating audiences. Two files, two readers.

1. `docs/ARCHITECTURE.md` — engineer-facing. Stays technical.
2. `docs/LAUNCH_READINESS.md` — new file, solicitor/DPO-facing. UK launch readiness only.

Marketing-copy audit (A.2) and refactor inventory (A.3) are delivered as chat outputs above this plan and **do not enter either file**.

## Resolved values (no placeholders left)

- Privacy & Terms effective date: **28 May 2026** (`EFFECTIVE_DATE` constant in `src/pages/Privacy.tsx` and `src/pages/Terms.tsx`). No semver — they share one date string.
- `dsr-exports` storage bucket: private, path `{user_id}/{request_id}.zip`, signed-URL TTL **7 days** (`SIGNED_URL_TTL_SECONDS` in `supabase/functions/dsr-export/index.ts`).
- Signed URLs minted by: `dsr-export` edge function via the **service-role** Supabase client.
- Object cleanup: dual-track — (a) opportunistic per-invocation purge of the **caller's own** ZIPs older than 7 days inside `dsr-export`; (b) systematic sweep via `prune-retention` against `retention_config.dataset_key = 'dsr_exports'` (retention_days 7, strategy `delete`).
- Schema placement: every Phase 1–8 **table** lives in `public`. Phase 3 added one **`private`-schema function**, `private.anonymise_dsr_requests(uuid)` (service_role EXECUTE only). The pre-existing `private.has_role` is reused by all new admin RLS policies. No other Phase 1–8 object lives in `private`.
- Phase merge-commit anchors (no git tags exist):
  P1 `e982ec4` · P2 `300bff9`, `6257c7a`, `335567f`, `b211e9c` · P3 `61f8bd6` · P4 `c60f25d` · P5 `76cba4f` · P6 `18670f1` · P7 `9660e27` · P8 `7292b89`.

## How it is now

- `docs/ARCHITECTURE.md` (1129 lines, last refreshed pre-Phase 1) is missing every Phase 1–8 surface: 7 new tables, 1 new bucket, 6 new edge functions, 2 new routes (`/cookies`, `/accessibility`), ~10 new components, and the chunk-recovery resilience layer. It also still contains some pre-EU-lock wording.
- `docs/LAUNCH_READINESS.md` does not exist.

## File 1 — `docs/ARCHITECTURE.md` (technical refresh)

Engineer audience only. No executive summary, no readiness checklist.

### §1 Product overview
Keep current text; add one line cross-linking to `docs/LAUNCH_READINESS.md` for the legal/launch view.

### §3 Top-level routes
Add `/cookies` → `pages/Cookies` and `/accessibility` → `pages/Accessibility`.

### §5 Data model
- §5.3 Add `jobs.upload_consent_id uuid` — populated by `create-job` after verifying a fresh (≤30 min) row in `consent_events`.
- New **§5.9 — Consent, retention and rights ledger** (all `public` schema unless noted):
  - `consent_versions` — versioned text (EN/IT/FR + hash); read-only to authenticated.
  - `consent_events` — append-only audit; IP hashed via `CONSENT_IP_SALT_SECRET`; SELECT to owner + admin.
  - `retention_config`, `retention_config_audit` — admin-managed schedule + change log.
  - `retention_alerts` — throttled alert audit driven by `_shared/retention-alerts.ts`.
  - `dsr_requests` — Art. 15/16/20 audit row written by `dsr-export` and `dsr-rectification-request`.
  - `recipient_notifications` — told-once Art. 14 audit; recipient email stored as HMAC with daily-rotated salt.
- Add explicit **"Schema placement"** call-out: all the above tables are in `public`; Phase 3's `private.anonymise_dsr_requests(uuid)` is the only Phase 1–8 object in the `private` schema (service_role EXECUTE only). `private.has_role` (pre-existing) backs every new admin policy.
- §5.8 Storage: add `dsr-exports` row with the resolved values (private; path `{user_id}/{request_id}.zip`; signed URL minted by `dsr-export` edge function via service_role; 7-day TTL; cleaned up by `dsr-export` opportunistic purge + `prune-retention` daily sweep on `dataset_key = 'dsr_exports'`).

### §6 Edge functions
Add rows for `record-consent`, `record-upload-attestation`, `dsr-export`, `dsr-rectification-request`, `prune-retention` (with `dry_run`), `retention-monitor-watchdog`. One-line purpose + auth posture each.

### §7 Client architecture
- §7.1 List new components: `Reg37ConsentDialog`, `UploadAttestationDialog`, `CookieNotice`, `DataRightsCard`, `PolicyRichText`, `RetentionTab`, `RetentionMonitorTab`, `DsrTab`, `ChunkErrorBoundary`, `PageLoadingFallback`.
- §7.6 Drift guards: add `policy-locale-parity.test.ts`, `cookie-inventory.test.ts`, `chunk-recovery.test.ts`, `retention-plan.test.ts`, `retention-alerts.test.ts`, `recipient-notice.test.ts`, `upload-attestation-strings.test.ts`, `dsr-export-builder.test.ts`.
- New §7.9 — **Resilience (stale-chunk recovery)**: `chunk-recovery.ts` + `chunk-diagnostics.ts` + `ChunkErrorBoundary` + admin Diagnostics tab. One paragraph.

### New §11 — UK compliance surface (engineer-facing map)
One row per phase, columns: **legal basis · table(s) / bucket(s) · edge function(s) · client surface · drift guard · merge-commit anchor**. Anchors use the SHAs above. This is the section a future maintainer reads to locate a phase's change set.

### New §12 — "Legal context" (hard-bounded)
Single subsection with the exact H2 heading **`## 12. Legal context (historical references)`**. The grep rule below applies as a hard pass/fail on the whole file:

```
awk '/^## 12\. Legal context/{flag=1} /^## /{if($0!~/^## 12\./)flag=0} !flag' docs/ARCHITECTURE.md \
  | grep -n -E "processed in the US|United States" && exit 1 || exit 0
```

Outside §12, **zero** matches for `processed in the US` or `United States` are allowed. CI / local check: this awk-grep returns non-zero on any violation.

## File 2 — `docs/LAUNCH_READINESS.md` (new, solicitor/DPO-facing)

Plain-English. No code references except as footnotes. Single audience.

Sections:

1. **Executive summary** — what WhatSaid is, who can use it, where data lives, who touches it, the legal frame (UK GDPR, DPA 2018, PECR, CCR 2013, CRA 2015, Equality Act 2010).
2. **What's published and live** — Privacy Notice (effective 28 May 2026), Terms of Service (effective 28 May 2026), Cookie Notice (`/cookies`), Accessibility Statement (`/accessibility`), Reg. 37 immediate-supply consent at checkout, DSR self-service in Settings, share-recipient Art. 14 notice, uploader lawful-basis attestation.
3. **Mandatory-to-publish — open items** (concise list, no implementation):
   - ICO registration / data-protection fee status.
   - Trading name / Companies House line on a Contact page or in the footer.
   - Postal-address-on-request workflow ownership.
   - Complaints SLA wording (we say "1 month" in Privacy; confirm internal process).
   - Standalone sub-processor list page (currently inside Privacy §7).
4. **Data flow (one diagram, two paragraphs)** — UK user → Lovable Cloud (EU) → AssemblyAI (EU only) → Lovable AI Gateway → user; audio deleted immediately post-processing; Paddle (GB only) for payments.
5. **Retention schedule** — table sourced from `retention_config` with horizons and legal basis per dataset, including `dsr_exports` (7 days).
6. **User rights & how to exercise them** — Settings → Data rights card (Export, Rectification, Clear local data, Delete). ICO escalation path.
7. **Phase ledger** — same legal-basis → live-since table as §11 of ARCHITECTURE.md, but stripped of edge-function/table names; uses the commit SHAs as the audit anchor.

Out of scope: marketing-copy claims (A.2) and refactor opportunities (A.3) — delivered in chat, not in this file.

## Out of scope (explicitly)
- No code changes, no migrations, no edge function edits.
- No marketing-copy rewrites (audit checklist already delivered in chat as A.2).
- No refactor PRs (inventory already delivered in chat as A.3).
- No new pages or routes.
- Privacy / Terms / Cookies / Accessibility page bodies are not touched (Phase 7/8 already live).

## Verification
- `npm run docs:check:arch` passes (drift guard already covers the new tables/functions).
- US-mention check passes the awk-grep above (zero matches outside §12).
- Manual read of ARCHITECTURE §11 + LAUNCH_READINESS by you before sharing.
- Spot-check: every commit SHA in the Phase ledger resolves with `git show <sha> --stat`.

## Files touched
- `docs/ARCHITECTURE.md` — edited
- `docs/LAUNCH_READINESS.md` — created

