
## Plan: implement `docs/product/capabilities.md`

Single-pass write of the documentation file based on the verified codebase audit. No code changes elsewhere.

### File location
`docs/product/capabilities.md` (new file, new `docs/` tree).

### Frontmatter (exactly as requested)
```yaml
---
title: WhatSaid — Product Capabilities
purpose: Single source of truth for documentation, FAQ, help content, and marketing copy extraction.
audience: internal (product, support, marketing, AI assistants)
last_reviewed: 2026-04-18
review_notes: First pass after Q&A extra-sources feature shipped. Verify items in "Needs review" before public extraction.
---
```

### Per-capability block (exact requested fields)
Status · Confidence · Needs review · Public copy eligible · Audience · Where it appears · What it does · How it works (optional, ≤1 sentence, support-facing) · Dependencies / preconditions · Limits / constraints · Homepage seed · Pricing seed · FAQ seeds · Help topic · Source files

### Document outline
1. How to use this document (legend, status/confidence/review semantics)
2. Product summary (1 factual paragraph)
3. Glossary (job, output, credit, transcript, summary, Q&A, share, claim, tag, variant)
4. Capability index (table: ID · category · name · status · audience · public-eligible)
5. Capabilities by category (blocks below)
6. Cross-cutting properties (formats, languages, exports, currencies, retention, accessibility)
7. Out of scope (only safe, clearly-not-supported items)
8. Reuse extraction guide (grep recipes; exclusion rules)
9. Needs review list
10. Partial capabilities list
11. Inferred capabilities list
12. Public-copy-excluded but user-facing list
13. Change log

### Capabilities to document (verified against code)

**User-facing (status: live unless noted)**
- CAP-001 Audio upload (.m4a/.mp3/.wav, ≤100 MB, ≤60 min) — `src/lib/pricing.ts`, `AudioUploader`
- CAP-002 Auto language detection + manual override — `LanguageSelector`, `transcribe`
- CAP-003 Full transcription with timestamps — `transcribe`, `TranscriptEditor`
- CAP-004 Speaker diarization & speaker labels — `SpeakerChips`, `ParticipantsPanel`
- CAP-005 Speaker rename + AI-suggested speaker identification — `identify-speakers`, `suggest-speakers`, `SpeakerIdentificationBanner`
- CAP-006 Structured summary (key points / actions) — `StructuredSummary`, `post-process`
- CAP-007 Summary regeneration after transcript edits (cap 3) — verified counter `summary_regen_count` in JobResults
- CAP-008 Custom Q&A on transcript — `JobResults` Questions tab, `regenerate`
- CAP-009 Multi-transcript Q&A grounding (extra sources, max 5) — `QuestionExtraSourcesPicker`, persisted metadata
- CAP-010 Edit / re-ask / delete saved Q&A — verified in JobResults
- CAP-011 Transcript inline editing — `TranscriptEditor`
- CAP-012 AI-generated tags + manual tags — `JobDetailTags`, `generate-tags`
- CAP-013 Tag translation cache (multilingual rendering) — `translate-tags`, `use-translated-tags`
- CAP-014 Output/summary language switch (translation variants) — `job_output_variants`
- CAP-015 Title autogeneration + manual rename — `generate-title`
- CAP-016 Recording date + location metadata extraction — `audio-creation-date`, `location.ts`
- CAP-017 Word count + reading time — verified in JobDetail
- CAP-018 Exports: TXT, JSON, DOC (synchronous) — `ExportButton`, `export-txt/json/docx`
- CAP-019 PDF export (async via notifications) — `startPdfExport`, NotificationsContext
- CAP-020 Share via email link (2-day expiry) — `share-transcript`, `claim-transcript-share`, `ClaimShare`
- CAP-021 Share PDF download link — `share-transcript-record`, `download-shared-pdf`, `SharedPdfDownload`
- CAP-022 In-app notifications (async export readiness) — `NotificationsContext`, `Notifications.tsx` *(scope: confirmed for PDF exports; other event types — needs review)*
- CAP-023 History list with filters & search — `History`, `HistoryFilters`
- CAP-024 Email/password + Google OAuth signup & login — `Login`, `Signup`, `lovable.auth.signInWithOAuth`
- CAP-025 Password setup for OAuth-first users — `needsPasswordSetup` flow
- CAP-026 Password reset — `ResetPassword`, `SetPassword`
- CAP-027 Profile (avatar, display name, stats) — `Profile`, `AvatarUpload`
- CAP-028 Settings (display name, contact email, UI language) — `Settings`
- CAP-029 UI in EN / IT / FR — `i18n/locales`
- CAP-030 Account deletion — `delete-account`
- CAP-031 Credit packs (1 / 5 / 20) via Paddle in GBP/USD/EUR — `Pricing`, `paddle-checkout`, `paddle-pricing`
- CAP-032 Credit-based transcription (1/2/3/4 credits per 15-min bracket) — `creditsForDuration`
- CAP-033 Audio deletion after processing (privacy) — `cleanup-assemblyai`, Privacy page

**Partial / conditional**
- CAP-P-001 Audio enhancement (template-gated) — eligible flag from admin template; user has no toggle → status: partial, public-copy: no
- CAP-P-002 Speech model selection — admin template-controlled, no user UI → partial / admin-only
- CAP-P-003 Notifications for non-export events — only PDF export confirmed in code → partial, needs review

**Admin-only (status: admin-only, public-copy: no)**
- CAP-A-001 Admin dashboard (`/admin`) with `AdminGuard`
- CAP-A-002 Transcribe templates (`TranscribeTemplatesTab`, `TemplateEditor`)
- CAP-A-003 Edge logs viewer (`EdgeLogsList`, `LogsTab`)
- CAP-A-004 Job audit (`JobAuditCard`, `admin-get-job-details`)
- CAP-A-005 Tag quality flags (scan/fix non-English) (`OthersTab`, `scan-non-english-tags`, `fix-flagged-tags`)
- CAP-A-006 Invite system (`AdminInviteCard`, `invite-user`, `redeem-invite`)
- CAP-A-007 Admin unlimited credits

**Internal (status: internal, public-copy: no)**
- CAP-I-001 Async job system (`async_jobs`)
- CAP-I-002 Email pipeline (`process-email-queue`, `auth-email-hook`, `email_send_log`, `suppressed_emails`)
- CAP-I-003 Stale-job cleanup (`cleanup-stale-jobs`)
- CAP-I-004 AssemblyAI cleanup (`cleanup-assemblyai`)
- CAP-I-005 AI gateway abstraction (`_shared/ai-gateway.ts`)
- CAP-I-006 Paddle webhook (`paddle-webhook`)
- CAP-I-007 Profile email validation (`validate-profile-email`)

### Out of scope (conservative — only items users likely assume)
- No guest / pay-per-conversion flow today (account required)
- No live / real-time transcription
- No team / shared workspaces
- No public API
- No native mobile app
- No subscription plans (one-time credit purchases only)

(I will NOT speculate beyond these.)

### Inclusion rules I will follow
- Verified-in-code claims only; otherwise mark `confidence: inferred` + `Needs review: yes`.
- No marketing prose in seed fields — short factual hints or `n/a`.
- Vendor names (AssemblyAI, Paddle, Lovable AI) only in `Source files` and Privacy/legal context, never in homepage/pricing seeds.
- "99 languages" treated as `inferred` (UI claim, not enumerated in code).
- Audio enhancement and speech model selection marked `partial` + `Public copy eligible: no` since they're admin-template-controlled.

### After writing, summary I will return
- Total capabilities documented (count)
- Counts by status: live / partial / admin-only / internal
- Top items most needing manual review (with reason)

### Files touched
- `docs/product/capabilities.md` (new) — only this file.
