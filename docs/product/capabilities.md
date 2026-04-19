---
title: WhatSaid — Product Capabilities
purpose: Single source of truth for documentation, FAQ, help content, and marketing copy extraction.
audience: internal (product, support, marketing, AI assistants)
last_reviewed: 2026-04-19
review_notes: Pricing model switched to per-file credits (1 credit per file ≤120 min, +1 credit per additional 120-min block, max 480 min).
---

# WhatSaid — Product Capabilities

## How to use this document

This file is the canonical inventory of what WhatSaid actually does today. It is **not** marketing copy and not a roadmap. Treat every block as a fact-checked record; downstream copy (homepage, pricing, FAQ, help centre) should be derived from the seed fields, not invented around them.

### Legend

**Status**
- `live` — shipped, reachable by intended audience without flags or workarounds.
- `partial` — code present but UX is conditional, hidden behind admin config, or not fully exposed to end users.
- `admin-only` — only available to users with the `admin` role.
- `internal` — supporting infrastructure with no direct user-facing surface.

**Confidence**
- `verified-in-code` — behaviour traced through source files end-to-end.
- `verified-in-UI` — observed in rendered UI / i18n strings; underlying code path not exhaustively traced.
- `inferred` — strong signal but not fully verified; treat with caution.

**Needs review** — `yes` means a human should re-verify before this capability is used in public copy.

**Public copy eligible** — `yes` means seed fields can be extracted for homepage / pricing / help / FAQ. `no` means do not surface (admin-only, internal, partial-and-unstable, or sensitive).

### Update protocol

When you change code that touches a capability, update the matching block in the same PR. When in doubt, downgrade `Status` or `Confidence` rather than overstating.

---

## Product summary

WhatSaid is a web app for turning uploaded audio (.m4a, .mp3, .wav up to 100 MB / 480 minutes) into a clean, editable transcript with speaker labels, a structured summary, custom Q&A, and exports (TXT, JSON, DOC, PDF). It is account-based, prepaid via credit packs (1 credit per file up to 120 min — longer files cost +1 credit per extra 120-min block), available in English / Italian / French, and deletes uploaded audio after processing.

---

## Glossary

- **Job** — a single audio upload and its lifecycle (pending → processing → completed / failed).
- **Output** — a generated artefact attached to a job: transcript, summary, custom answer, title, tags.
- **Variant** — a translated copy of an output stored in `job_output_variants`.
- **Credit** — prepaid unit consumed by transcription; 1 credit covers 1 transcription up to 120 minutes. Files longer than 120 minutes cost +1 credit per additional 120-min block (max 480 min per file).
- **Transcript** — the full speaker-labelled text of a job.
- **Summary** — the structured key-points / key-actions output derived from the transcript.
- **Q&A** — a custom user prompt answered against the transcript (optionally grounded with extra transcripts).
- **Share** — a time-limited link sending a transcript to a recipient by email.
- **Claim** — the recipient action that copies a shared transcript into their own account.
- **Tag** — a keyword (AI- or user-generated) used to organise jobs in History.

---

## Capability index

| ID | Category | Name | Status | Audience | Public copy |
|---|---|---|---|---|---|
| CAP-001 | Audio ingestion | Audio upload (.m4a/.mp3/.wav, ≤100 MB, ≤480 min) | live | user | yes |
| CAP-002 | Audio ingestion | Auto language detection + manual override | live | user | yes |
| CAP-003 | Transcription | Full transcript with timestamps | live | user | yes |
| CAP-004 | Transcription | Speaker diarization & speaker labels | live | user | yes |
| CAP-005 | Transcription | Speaker rename + AI-suggested identification | live | user | yes |
| CAP-006 | Summary | Structured summary (key points / key actions) | live | user | yes |
| CAP-007 | Summary | Summary regeneration after transcript edits | live | user | yes |
| CAP-008 | Q&A | Custom Q&A on transcript | live | user | yes |
| CAP-009 | Q&A | Multi-transcript Q&A grounding | live | user | yes |
| CAP-010 | Q&A | Edit / re-ask / delete saved Q&A | live | user | yes |
| CAP-011 | Editing | Inline transcript editing | live | user | yes |
| CAP-012 | Organisation | AI-generated tags + manual tags | live | user | yes |
| CAP-013 | Organisation | Tag translation cache | live | user | no |
| CAP-014 | Translation | Output / summary language switch (variants) | live | user | yes |
| CAP-015 | Metadata | Title autogeneration + manual rename | live | user | yes |
| CAP-016 | Metadata | Recording date + location metadata extraction | live | user | yes |
| CAP-017 | Metadata | Word count + reading time | live | user | yes |
| CAP-018 | Export | Synchronous exports: TXT, JSON, DOC | live | user | yes |
| CAP-019 | Export | PDF export (async via notifications) | live | user | yes |
| CAP-020 | Sharing | Share via email link (2-day expiry) | live | user | yes |
| CAP-021 | Sharing | Shared PDF download link | live | user | yes |
| CAP-022 | Notifications | In-app notifications | partial | user | no |
| CAP-023 | History | History list with filters & search | live | user | yes |
| CAP-024 | Auth | Email/password + Google OAuth signup & login | live | user | yes |
| CAP-025 | Auth | Password setup for OAuth-first users | live | user | no |
| CAP-026 | Auth | Password reset | live | user | yes |
| CAP-027 | Account | Profile (avatar, display name, stats) | live | user | yes |
| CAP-028 | Account | Settings (display name, contact email, UI language) | live | user | yes |
| CAP-029 | i18n | UI in EN / IT / FR | live | user | yes |
| CAP-030 | Account | Account deletion | live | user | yes |
| CAP-031 | Billing | Credit packs (1 / 5 / 20) via Paddle in GBP/USD/EUR | live | user | yes |
| CAP-032 | Billing | Credit-based transcription pricing | live | user | yes |
| CAP-033 | Privacy | Audio deletion after processing | live | user | yes |
| CAP-P-001 | Audio ingestion | Audio enhancement (template-gated) | partial | user | no |
| CAP-P-002 | Transcription | Speech model selection | partial | admin | no |
| CAP-A-001 | Admin | Admin dashboard | admin-only | admin | no |
| CAP-A-002 | Admin | Transcribe settings templates | admin-only | admin | no |
| CAP-A-003 | Admin | Edge function logs viewer | admin-only | admin | no |
| CAP-A-004 | Admin | Per-job audit view | admin-only | admin | no |
| CAP-A-005 | Admin | Tag quality flags (scan / fix non-English) | admin-only | admin | no |
| CAP-A-006 | Admin | Invite system | admin-only | admin | no |
| CAP-A-007 | Admin | Admin unlimited credits | admin-only | admin | no |
| CAP-I-001 | Internal | Async job system | internal | — | no |
| CAP-I-002 | Internal | Email pipeline | internal | — | no |
| CAP-I-003 | Internal | Stale-job cleanup | internal | — | no |
| CAP-I-004 | Internal | AssemblyAI cleanup | internal | — | no |
| CAP-I-005 | Internal | AI gateway abstraction | internal | — | no |
| CAP-I-006 | Internal | Paddle webhook | internal | — | no |
| CAP-I-007 | Internal | Profile email validation | internal | — | no |

---

## Capabilities by category

### Audio ingestion

#### CAP-001 — Audio upload
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/convert` page, drag-and-drop / file picker.
- **What it does:** Accepts a single audio file up to 100 MB and 480 minutes (8 hours) for transcription.
- **How it works:** Client validates extension and MIME type, then uploads to private storage and creates a job record.
- **Dependencies / preconditions:** Signed-in account; sufficient credits to cover the duration (1 credit per 120-min block).
- **Limits / constraints:** `.m4a`, `.mp3`, `.wav` only; ≤100 MB; ≤480 min.
- **Homepage seed:** Upload audio up to 480 minutes; m4a / mp3 / wav supported.
- **Pricing seed:** 1 credit per file up to 120 min — longer files use additional credits.
- **FAQ seeds:** What audio formats are supported? What's the maximum file size and length?
- **Help topic:** Uploading audio
- **Source files:** `src/pages/Convert.tsx`, `src/components/AudioUploader.tsx`, `src/lib/pricing.ts`

#### CAP-002 — Auto language detection + manual override
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/convert` language selector before submitting.
- **What it does:** Auto-detects the spoken language during transcription and lets the user override it manually.
- **Dependencies / preconditions:** Upload in progress.
- **Limits / constraints:** Override applies to that single job only.
- **Homepage seed:** Auto-detected language with manual override.
- **Pricing seed:** n/a
- **FAQ seeds:** Which languages can WhatSaid transcribe? Can I force a specific language?
- **Help topic:** Choosing the transcription language
- **Source files:** `src/components/LanguageSelector.tsx`, `src/lib/languages.ts`, `supabase/functions/transcribe/index.ts`

### Transcription

#### CAP-003 — Full transcript with timestamps
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/job/:id` Transcript tab.
- **What it does:** Produces a complete, segmented transcript of the audio with timestamps.
- **Dependencies / preconditions:** Completed job.
- **Limits / constraints:** Accuracy depends on audio quality and language.
- **Homepage seed:** Full transcript with timestamps.
- **Pricing seed:** Full transcript included with every conversion.
- **FAQ seeds:** Do transcripts include timestamps? How accurate are transcripts?
- **Help topic:** Reading your transcript
- **Source files:** `supabase/functions/transcribe/index.ts`, `src/components/TranscriptEditor.tsx`, `src/lib/transcript.ts`

#### CAP-004 — Speaker diarization & speaker labels
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Transcript view; speaker chips above the transcript.
- **What it does:** Splits the transcript by speaker and assigns a label to each.
- **Dependencies / preconditions:** Completed job; multi-speaker audio.
- **Limits / constraints:** Quality depends on channel separation and audio clarity.
- **Homepage seed:** Speaker-labelled transcripts.
- **Pricing seed:** Speaker labels included.
- **FAQ seeds:** Does WhatSaid identify different speakers?
- **Help topic:** Working with speakers
- **Source files:** `src/components/SpeakerChips.tsx`, `src/components/ParticipantsPanel.tsx`, `src/lib/speaker-names.ts`

#### CAP-005 — Speaker rename + AI-suggested identification
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Speaker chips, identification banner on the job page.
- **What it does:** Lets the user rename speakers and accept AI suggestions for who each speaker is, based on transcript context.
- **Dependencies / preconditions:** Completed job with diarization.
- **Limits / constraints:** Suggestions only fire when the transcript provides enough cues.
- **Homepage seed:** Rename speakers; AI suggests names from context.
- **Pricing seed:** n/a
- **FAQ seeds:** Can I rename speakers? How does WhatSaid guess who's speaking?
- **Help topic:** Naming speakers
- **Source files:** `src/components/SpeakerIdentificationBanner.tsx`, `supabase/functions/identify-speakers/index.ts`, `supabase/functions/suggest-speakers/index.ts`, `src/lib/speaker-identification.ts`

#### CAP-P-002 — Speech model selection
- **Status:** partial
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** no
- **Audience:** admin (effective)
- **Where it appears:** Admin transcribe templates only; no end-user toggle.
- **What it does:** Selects the underlying speech-to-text model used for a job via an admin-managed template.
- **Dependencies / preconditions:** Admin role to edit the active template.
- **Limits / constraints:** End users inherit whatever the active template specifies.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** n/a
- **Help topic:** n/a
- **Source files:** `src/components/admin/TranscribeTemplatesTab.tsx`, `src/components/admin/TemplateEditor.tsx`, `src/lib/transcribe-template.ts`

### Summary

#### CAP-006 — Structured summary
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/job/:id` Summary tab.
- **What it does:** Produces a structured summary including key points and key actions extracted from the transcript.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Quality depends on transcript clarity.
- **Homepage seed:** Structured summary with key points and actions.
- **Pricing seed:** Summary included with every conversion.
- **FAQ seeds:** What does the summary include? How is it generated?
- **Help topic:** Reading your summary
- **Source files:** `src/components/StructuredSummary.tsx`, `supabase/functions/post-process/index.ts`

#### CAP-007 — Summary regeneration after transcript edits
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Summary tab when transcript has been edited.
- **What it does:** Regenerates the summary so it reflects edits made to the transcript, with a per-job cap.
- **Dependencies / preconditions:** A completed summary plus subsequent transcript edits.
- **Limits / constraints:** Capped per job (`summary_regen_count`).
- **Homepage seed:** Summary refreshes after transcript edits.
- **Pricing seed:** n/a
- **FAQ seeds:** Does the summary update when I edit the transcript?
- **Help topic:** Regenerating the summary
- **Source files:** `src/components/JobResults.tsx`, `supabase/functions/regenerate/index.ts`

### Q&A

#### CAP-008 — Custom Q&A on transcript
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/job/:id` Questions tab.
- **What it does:** Lets the user ask free-form questions about the transcript and stores the answers.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Per-job question counter (`question_generation_count`).
- **Homepage seed:** Ask questions about your transcript.
- **Pricing seed:** Q&A included with every conversion.
- **FAQ seeds:** What kind of questions can I ask? Are answers saved?
- **Help topic:** Asking questions about a transcript
- **Source files:** `src/components/JobResults.tsx`, `supabase/functions/regenerate/index.ts`

#### CAP-009 — Multi-transcript Q&A grounding
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Questions tab — "Additional transcripts" toggle and picker.
- **What it does:** Grounds an answer in the current transcript plus up to 5 other transcripts the user owns; the current transcript remains the primary source.
- **Dependencies / preconditions:** At least one other completed transcript owned by the user.
- **Limits / constraints:** Max 5 extra transcripts; combined input capped server-side; only the user's own completed transcripts.
- **Homepage seed:** Ask questions across multiple transcripts.
- **Pricing seed:** n/a
- **FAQ seeds:** Can I ask questions across several transcripts? Whose transcripts can I include?
- **Help topic:** Adding extra transcripts to a question
- **Source files:** `src/components/QuestionExtraSourcesPicker.tsx`, `src/components/JobResults.tsx`, `supabase/functions/regenerate/index.ts`, `supabase/functions/_shared/prompts.ts`

#### CAP-010 — Edit / re-ask / delete saved Q&A
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Saved answers in the Questions tab.
- **What it does:** Lets the user edit a saved prompt and regenerate the answer, or delete the entry.
- **Dependencies / preconditions:** At least one saved Q&A entry.
- **Limits / constraints:** Same per-job question counter applies to re-asks.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** Can I edit or delete a saved question?
- **Help topic:** Managing saved questions
- **Source files:** `src/components/JobResults.tsx`, `supabase/functions/regenerate/index.ts`

### Editing

#### CAP-011 — Inline transcript editing
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/job/:id` Transcript tab.
- **What it does:** Lets the user fix words and lines directly in the transcript.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Edits are persisted to the transcript output.
- **Homepage seed:** Edit the transcript inline.
- **Pricing seed:** n/a
- **FAQ seeds:** Can I correct mistakes in the transcript?
- **Help topic:** Editing your transcript
- **Source files:** `src/components/TranscriptEditor.tsx`

### Organisation

#### CAP-012 — AI-generated tags + manual tags
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Job header and History filters.
- **What it does:** Generates topical tags from the transcript and lets the user add or remove tags manually.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Tags are scoped to the user.
- **Homepage seed:** Auto-tagged transcripts for organisation.
- **Pricing seed:** n/a
- **FAQ seeds:** How are tags generated? Can I add my own tags?
- **Help topic:** Tagging your transcripts
- **Source files:** `src/components/JobDetailTags.tsx`, `supabase/functions/generate-tags/index.ts`, `src/hooks/use-job-tags.ts`

#### CAP-013 — Tag translation cache
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** no
- **Audience:** authenticated user (transparent)
- **Where it appears:** Tag chips throughout the app.
- **What it does:** Translates tag labels to the active UI language and caches the result.
- **Dependencies / preconditions:** A tag exists in a language other than the UI language.
- **Limits / constraints:** Cache is shared across users.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** n/a
- **Help topic:** n/a
- **Source files:** `supabase/functions/translate-tags/index.ts`, `src/hooks/use-translated-tags.ts`, `src/lib/tag-translation.ts`

### Translation

#### CAP-014 — Output / summary language switch
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Job page output controls.
- **What it does:** Generates and caches a translated variant of an output (e.g. summary) in another language.
- **Dependencies / preconditions:** Completed source output.
- **Limits / constraints:** Variants are cached per (output, language) pair.
- **Homepage seed:** Translate outputs into another language.
- **Pricing seed:** n/a
- **FAQ seeds:** Can I get the summary in a different language?
- **Help topic:** Translating an output
- **Source files:** `supabase/functions/regenerate/index.ts` (translation path), `job_output_variants` table

### Metadata

#### CAP-015 — Title autogeneration + manual rename
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Job page header; History list.
- **What it does:** Generates a short descriptive title from the transcript and lets the user rename it.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Title is stored on the job record.
- **Homepage seed:** Auto-generated titles you can rename.
- **Pricing seed:** n/a
- **FAQ seeds:** Where do titles come from? Can I rename a job?
- **Help topic:** Renaming a transcript
- **Source files:** `supabase/functions/generate-title/index.ts`, `src/pages/JobDetail.tsx`

#### CAP-016 — Recording date + location metadata extraction
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Job page metadata area.
- **What it does:** Extracts the recording date and (when present) the location embedded in the audio file's metadata.
- **Dependencies / preconditions:** The source file contains the relevant metadata (e.g. iOS Voice Memos).
- **Limits / constraints:** Many recordings carry no metadata; falls back to file modification date when needed.
- **Homepage seed:** Recording date and location surfaced when available.
- **Pricing seed:** n/a
- **FAQ seeds:** Where does the recording date come from? Why is no date shown?
- **Help topic:** Recording metadata
- **Source files:** `src/lib/audio-creation-date.ts`, `src/lib/recorded-date.ts`, `src/lib/location.ts`

#### CAP-017 — Word count + reading time
- **Status:** live
- **Confidence:** verified-in-UI
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Job page transcript header.
- **What it does:** Shows the transcript's word count and an estimated reading time.
- **Dependencies / preconditions:** Completed transcript.
- **Limits / constraints:** Reading time is an estimate.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** n/a
- **Help topic:** n/a
- **Source files:** `src/pages/JobDetail.tsx`

### Export

#### CAP-018 — Synchronous exports: TXT, JSON, DOC
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Export dropdown on the job page.
- **What it does:** Downloads the transcript and outputs as a TXT, JSON, or DOC file in the browser.
- **Dependencies / preconditions:** Completed job with a transcript.
- **Limits / constraints:** Sync — large jobs export in the browser.
- **Homepage seed:** Export to TXT, JSON, DOC.
- **Pricing seed:** All export formats included.
- **FAQ seeds:** Which formats can I download? What's in the JSON export?
- **Help topic:** Exporting a transcript
- **Source files:** `src/components/ExportButton.tsx`, `src/lib/export-txt.ts`, `src/lib/export-json.ts`, `src/lib/export.ts`

#### CAP-019 — PDF export (async)
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Export dropdown → PDF; progress shown in the notification bell.
- **What it does:** Generates a PDF in the background and notifies the user when it's ready to download.
- **Dependencies / preconditions:** Completed job with a transcript.
- **Limits / constraints:** Async — delivery via in-app notification.
- **Homepage seed:** Export to PDF.
- **Pricing seed:** PDF export included.
- **FAQ seeds:** How long does the PDF take? Where do I find it once it's ready?
- **Help topic:** Exporting to PDF
- **Source files:** `src/components/ExportButton.tsx`, `src/contexts/NotificationsContext.tsx`, `src/lib/export-pdf.ts`

### Sharing

#### CAP-020 — Share via email link (2-day expiry)
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user (sender), anyone with the link (recipient)
- **Where it appears:** Share button on the job page; `/claim/:token` for the recipient.
- **What it does:** Sends a one-time link to a recipient by email; recipient can claim a copy of the transcript into their own account.
- **Dependencies / preconditions:** Completed job; recipient email address.
- **Limits / constraints:** Link expires after 2 days; single claim.
- **Homepage seed:** Share transcripts by email; link expires in 2 days.
- **Pricing seed:** Sharing included.
- **FAQ seeds:** How long does a share link last? Does the recipient need an account?
- **Help topic:** Sharing a transcript
- **Source files:** `src/components/ShareButton.tsx`, `supabase/functions/share-transcript/index.ts`, `supabase/functions/claim-transcript-share/index.ts`, `src/pages/ClaimShare.tsx`

#### CAP-021 — Shared PDF download link
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** yes
- **Audience:** anyone with the link
- **Where it appears:** `/shared/:token` page.
- **What it does:** Lets a recipient download a one-off PDF of a shared transcript without claiming it.
- **Dependencies / preconditions:** Valid share token.
- **Limits / constraints:** Same time-limited token semantics as CAP-020.
- **Homepage seed:** Recipients can download a PDF without signing up.
- **Pricing seed:** n/a
- **FAQ seeds:** Can someone download a PDF of a transcript I share?
- **Help topic:** Downloading a shared PDF
- **Source files:** `supabase/functions/share-transcript-record/index.ts`, `supabase/functions/download-shared-pdf/index.ts`, `src/pages/SharedPdfDownload.tsx`

### Notifications

#### CAP-022 — In-app notifications
- **Status:** partial
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** no
- **Audience:** authenticated user
- **Where it appears:** Notification bell in the navbar; `/notifications` page.
- **What it does:** Shows in-app notifications driven by the async-job system; PDF export readiness is the confirmed event type.
- **Dependencies / preconditions:** Signed-in account.
- **Limits / constraints:** Other event types not verified end-to-end.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** What notifications will I get?
- **Help topic:** Your notifications
- **Source files:** `src/components/NotificationBell.tsx`, `src/contexts/NotificationsContext.tsx`, `src/pages/Notifications.tsx`

### History

#### CAP-023 — History list with filters & search
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/history`.
- **What it does:** Lists past jobs with search and filtering (e.g. by tag).
- **Dependencies / preconditions:** Signed-in account with at least one job.
- **Limits / constraints:** Default Supabase row limits apply.
- **Homepage seed:** Searchable history of all your transcripts.
- **Pricing seed:** Unlimited history retention.
- **FAQ seeds:** Where do I find my past transcripts? How long is history kept?
- **Help topic:** Browsing your history
- **Source files:** `src/pages/History.tsx`, `src/components/HistoryFilters.tsx`, `src/hooks/use-history-filters.ts`

### Auth

#### CAP-024 — Email/password + Google OAuth signup & login
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** anyone
- **Where it appears:** `/login`, `/signup`.
- **What it does:** Lets users sign up and sign in with email/password or Google.
- **Dependencies / preconditions:** None.
- **Limits / constraints:** Email confirmation required.
- **Homepage seed:** Sign in with email or Google.
- **Pricing seed:** n/a
- **FAQ seeds:** How do I sign up? Can I use Google to sign in?
- **Help topic:** Signing in
- **Source files:** `src/pages/Login.tsx`, `src/pages/Signup.tsx`, `src/contexts/AuthContext.tsx`

#### CAP-025 — Password setup for OAuth-first users
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** no
- **Audience:** authenticated user (OAuth-first)
- **Where it appears:** `/set-password` after first Google sign-in.
- **What it does:** Lets users who first signed in with Google set a password so they can also use email/password.
- **Dependencies / preconditions:** `needs_password_setup` flag on the profile.
- **Limits / constraints:** One-time flow per account.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** n/a
- **Help topic:** Adding a password to a Google account
- **Source files:** `src/pages/SetPassword.tsx`, `src/contexts/AuthContext.tsx`

#### CAP-026 — Password reset
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** anyone with an account
- **Where it appears:** `/reset-password`.
- **What it does:** Sends a password reset email and lets the user set a new password.
- **Dependencies / preconditions:** Existing account with a verified email.
- **Limits / constraints:** Reset link is time-limited.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** I forgot my password — how do I reset it?
- **Help topic:** Resetting your password
- **Source files:** `src/pages/ResetPassword.tsx`, `src/pages/SetPassword.tsx`

### Account

#### CAP-027 — Profile (avatar, display name, stats)
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/profile`.
- **What it does:** Shows the user's avatar, display name, and account stats; lets them upload a new avatar.
- **Dependencies / preconditions:** Signed-in account.
- **Limits / constraints:** n/a
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** How do I change my avatar?
- **Help topic:** Your profile
- **Source files:** `src/pages/Profile.tsx`, `src/components/AvatarUpload.tsx`

#### CAP-028 — Settings (display name, contact email, UI language)
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/settings`.
- **What it does:** Lets the user change their display name, contact email, and UI language.
- **Dependencies / preconditions:** Signed-in account.
- **Limits / constraints:** Email change goes through a verification step.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** How do I change my email? How do I change the app language?
- **Help topic:** Account settings
- **Source files:** `src/pages/Settings.tsx`, `supabase/functions/validate-profile-email/index.ts`

#### CAP-030 — Account deletion
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/settings` → danger zone.
- **What it does:** Permanently deletes the user's account and associated data.
- **Dependencies / preconditions:** Signed-in account; user confirmation.
- **Limits / constraints:** Irreversible.
- **Homepage seed:** Delete your account at any time.
- **Pricing seed:** n/a
- **FAQ seeds:** How do I delete my account? What happens to my data?
- **Help topic:** Deleting your account
- **Source files:** `src/pages/Settings.tsx`, `supabase/functions/delete-account/index.ts`

### i18n

#### CAP-029 — UI in EN / IT / FR
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** anyone
- **Where it appears:** Language switcher in the navbar; persisted in profile settings.
- **What it does:** Renders the entire UI in English, Italian, or French.
- **Dependencies / preconditions:** None.
- **Limits / constraints:** Three UI languages today.
- **Homepage seed:** Available in English, Italian, and French.
- **Pricing seed:** n/a
- **FAQ seeds:** Which interface languages are supported?
- **Help topic:** Changing the app language
- **Source files:** `src/i18n/index.ts`, `src/i18n/locales/{en,fr,it}.json`, `src/components/LanguageSwitcher.tsx`

### Billing

#### CAP-031 — Credit packs (1 / 5 / 20) via Paddle in GBP / USD / EUR
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/pricing`, in-app top-up.
- **What it does:** Sells prepaid credit packs in three currencies through Paddle Checkout.
- **Dependencies / preconditions:** Signed-in account.
- **Limits / constraints:** Pack sizes: 1, 5, 20 credits. Currencies: GBP, USD, EUR.
- **Homepage seed:** Buy credits in packs of 1, 5, or 20.
- **Pricing seed:** Three pack sizes; pay in GBP, USD, or EUR; one-time purchase.
- **FAQ seeds:** Which currencies are supported? Do credits expire? How do I top up?
- **Help topic:** Buying credits
- **Source files:** `src/pages/Pricing.tsx`, `src/lib/paddle-checkout.ts`, `src/lib/paddle-pricing.ts`, `supabase/functions/paddle-webhook/index.ts`

#### CAP-032 — Credit-based transcription pricing
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** `/convert` price preview; `/pricing`.
- **What it does:** Charges credits per transcription using a per-file model: 1 credit for any file up to 120 minutes, +1 credit per additional 120-min block (max 4 credits at 480 min).
- **Dependencies / preconditions:** Sufficient credit balance to cover the upload.
- **Limits / constraints:** 1 credit per transcription up to 120 min; +1 credit per extra 120-min block; ceiling 480 min per file.
- **Homepage seed:** 1 credit covers a full transcription up to 120 minutes.
- **Pricing seed:** 1 credit per file up to 120 min; longer files use additional credits (1 per extra 120 min).
- **FAQ seeds:** How many credits does a transcription cost? How is duration measured?
- **Help topic:** How credits are charged
- **Source files:** `src/lib/pricing.ts`, `src/pages/Convert.tsx`

### Privacy

#### CAP-033 — Audio deletion after processing
- **Status:** live
- **Confidence:** verified-in-code
- **Needs review:** no
- **Public copy eligible:** yes
- **Audience:** authenticated user
- **Where it appears:** Conversion page notice, Privacy page.
- **What it does:** Deletes the uploaded audio file after the job completes; only the generated text is retained.
- **Dependencies / preconditions:** Completed (or failed and finalised) job.
- **Limits / constraints:** Tracked via `audio_deleted_at` and provider cleanup status.
- **Homepage seed:** Audio is deleted after processing — only your text is kept.
- **Pricing seed:** Privacy by default — audio deleted after processing.
- **FAQ seeds:** Do you store my audio? How long is the audio kept?
- **Help topic:** What happens to your audio
- **Source files:** `supabase/functions/cleanup-assemblyai/index.ts`, `src/pages/Privacy.tsx`

### Audio enhancement (partial)

#### CAP-P-001 — Audio enhancement (template-gated)
- **Status:** partial
- **Confidence:** verified-in-code
- **Needs review:** yes
- **Public copy eligible:** no
- **Audience:** authenticated user (transparent)
- **Where it appears:** No user toggle; controlled by the active admin transcribe template.
- **What it does:** Applies audio pre-processing (normalisation / channel handling) before transcription when the active template enables it.
- **Dependencies / preconditions:** Active admin template flag.
- **Limits / constraints:** Users cannot enable or disable this directly.
- **Homepage seed:** n/a
- **Pricing seed:** n/a
- **FAQ seeds:** n/a
- **Help topic:** n/a
- **Source files:** `src/lib/audio-enhance.ts`, `src/lib/audio-channels.ts`, `src/lib/transcribe-template.ts`

---

## Admin-only capabilities

Do not surface in any public copy or help content for end users.

#### CAP-A-001 — Admin dashboard
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **Where:** `/admin`, gated by `AdminGuard`.
- **What:** Entry point for all admin tooling.
- **Source files:** `src/pages/Admin.tsx`, `src/components/admin/AdminGuard.tsx`

#### CAP-A-002 — Transcribe settings templates
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **What:** Create and activate templates that define transcription configuration (model, enhancement, etc.) for new jobs.
- **Source files:** `src/components/admin/TranscribeTemplatesTab.tsx`, `src/components/admin/TemplateEditor.tsx`, `transcribe_settings_templates` table

#### CAP-A-003 — Edge function logs viewer
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **What:** Browse logs and recent invocations for backend functions.
- **Source files:** `src/components/admin/EdgeLogsList.tsx`, `src/components/admin/LogsTab.tsx`

#### CAP-A-004 — Per-job audit view
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **What:** Inspect a single job's full state and request payloads.
- **Source files:** `src/components/admin/JobAuditCard.tsx`, `src/components/admin/RequestPreviewPanel.tsx`, `supabase/functions/admin-get-job-details/index.ts`

#### CAP-A-005 — Tag quality flags (scan / fix non-English)
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **What:** Detect tags whose language doesn't match the user's UI language and remediate them.
- **Source files:** `src/components/admin/OthersTab.tsx`, `supabase/functions/scan-non-english-tags/index.ts`, `supabase/functions/fix-flagged-tags/index.ts`

#### CAP-A-006 — Invite system
- **Status:** admin-only · **Confidence:** verified-in-code · **Needs review:** no · **Public copy eligible:** no
- **What:** Send invitations that pre-load credits onto a new account when redeemed.
- **Source files:** `src/components/AdminInviteCard.tsx`, `supabase/functions/invite-user/index.ts`, `supabase/functions/redeem-invite/index.ts`, `src/hooks/use-redeem-invites.ts`

#### CAP-A-007 — Admin unlimited credits
- **Status:** admin-only · **Confidence:** inferred · **Needs review:** yes · **Public copy eligible:** no
- **What:** Admins effectively bypass the standard credit balance for transcription. Behaviour observed in product memory; verify against `deduct_credits` and admin checks in `process-job` before relying on it.
- **Source files:** `supabase/functions/process-job/index.ts`, `user_roles` table

---

## Internal / supporting capabilities

Plumbing — never surface to users.

- **CAP-I-001 — Async job system** (`async_jobs` table; powers PDF export and other background work).
- **CAP-I-002 — Email pipeline** (`process-email-queue`, `auth-email-hook`, `email_send_log`, `suppressed_emails`).
- **CAP-I-003 — Stale-job cleanup** (`supabase/functions/cleanup-stale-jobs/index.ts`).
- **CAP-I-004 — AssemblyAI cleanup** (`supabase/functions/cleanup-assemblyai/index.ts`).
- **CAP-I-005 — AI gateway abstraction** (`supabase/functions/_shared/ai-gateway.ts`).
- **CAP-I-006 — Paddle webhook** (`supabase/functions/paddle-webhook/index.ts`).
- **CAP-I-007 — Profile email validation** (`supabase/functions/validate-profile-email/index.ts`).

---

## Cross-cutting properties

- **Audio formats:** `.m4a`, `.mp3`, `.wav`. (`.m4a` is first-class.)
- **Audio limits:** ≤100 MB per file; ≤480 minutes (8 h) per file. Credits charged: 1 per file up to 120 min, +1 per additional 120-min block.
- **UI languages:** English, Italian, French.
- **Output / summary languages:** Translation variants generated on demand; underlying language coverage is provider-driven (treat any "99 languages" claim as inferred).
- **Export formats:** TXT, JSON, DOC (sync); PDF (async).
- **Currencies / payments:** GBP, USD, EUR via Paddle. One-time credit purchases — no subscriptions.
- **Privacy / retention:** Audio is deleted after processing. Generated text (transcript, summary, Q&A, tags, metadata) and minimal billing references are retained.
- **Accessibility commitments:** Keyboard navigation, focus states, semantic structure, and form labels reviewed on every UI change. Light and dark themes both supported; dark mode follows system preference.

---

## Out of scope (do not claim)

These are not implemented today and users may otherwise assume they are:

- No guest / pay-per-conversion flow — an account is required.
- No live or real-time transcription.
- No team / shared workspaces or multi-seat accounts.
- No public API.
- No native mobile app.
- No subscription plans — only one-time credit purchases.

---

## Reuse extraction guide

When generating downstream copy:

- **Homepage value props:** include only blocks where `Public copy eligible: yes` and `Homepage seed` is not `n/a`.
- **Pricing differentiators:** include only blocks where `Public copy eligible: yes` and `Pricing seed` is not `n/a`.
- **FAQ candidates:** include only blocks where `Public copy eligible: yes` and `FAQ seeds` is not `n/a`.
- **Help centre topics:** include only blocks where `Public copy eligible: yes` and `Help topic` is not `n/a`.

Always exclude:
- Anything with `Status: admin-only` or `Status: internal`.
- Anything with `Public copy eligible: no`.
- Anything in the **Out of scope** section above.

Re-verify any block tagged `Needs review: yes` before using its seeds.

---

## Needs review list

- **CAP-009 Multi-transcript Q&A grounding** — newly shipped; verify picker availability and persisted-chip rendering in production before public copy.
- **CAP-014 Output / summary language switch** — confirm the per-job UI surface and which output types are translatable.
- **CAP-016 Recording date + location metadata extraction** — verify location extraction surfaces only when present and degrades gracefully.
- **CAP-021 Shared PDF download link** — verify expiry semantics match CAP-020 (single token model).
- **CAP-022 In-app notifications** — confirm the full set of notification event types beyond PDF export.
- **CAP-P-001 Audio enhancement** — confirm whether any user-visible signal indicates that enhancement was applied.
- **CAP-P-002 Speech model selection** — confirm there is no end-user toggle anywhere in the UI.
- **CAP-A-007 Admin unlimited credits** — verify in `process-job` / credit deduction logic.

## Partial capabilities list

- **CAP-022 In-app notifications** — only PDF-export readiness verified end-to-end.
- **CAP-P-001 Audio enhancement** — no user toggle; admin-template-gated.
- **CAP-P-002 Speech model selection** — admin-template-controlled, no end-user UI.

## Inferred capabilities list

- **CAP-A-007 Admin unlimited credits** — behaviour stated in product memory; not exhaustively traced through the credit deduction path.

## Public-copy-excluded but user-facing

These are real user-facing features but should not be surfaced in homepage / pricing / FAQ extraction:

- **CAP-013 Tag translation cache** — user-visible effect, but the mechanism is not a marketable feature.
- **CAP-022 In-app notifications** — gated as `partial`; revisit once event coverage is verified.
- **CAP-025 Password setup for OAuth-first users** — narrow flow; belongs in help content only.
- **CAP-P-001 Audio enhancement** — user-transparent and admin-gated.

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-18 | Initial document. | AI assistant (post Q&A extra-sources release) |
| 2026-04-19 | Switched credit model to per-file: 1 credit per transcription up to 120 min, +1 credit per extra 120-min block, max 480 min per file. Updated CAP-001, CAP-032, glossary, summary, audio-limits footer. | AI assistant |
