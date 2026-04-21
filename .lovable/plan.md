

# Plan — Add "Cost model and per-transcript cost drivers" to ARCHITECTURE.md

## Goal

Add a new top-level section (`## 10. Cost model and per-transcript cost drivers`) to `docs/ARCHITECTURE.md`, placed **between the current `## 9. Reference: key external dependencies` and the "Last updated" footer**. The section is documentation only — no code changes, no behavioural changes.

All content is grounded in the current code paths already verified (`process-job`, `transcribe`, `post-process`, `regenerate`, `_shared/auto-tag.ts`, `generate-title`, `generate-tags`, `identify-speakers`, `suggest-speakers`, `share-transcript`, `share-transcript-record`, `download-shared-pdf`, `process-email-queue`, `watchdog-stale-jobs`, `cleanup-assemblyai`, `src/pages/Convert.tsx`, `src/components/JobResults.tsx`, `src/components/ShareButton.tsx`, `src/lib/export-pdf.ts`, `src/lib/audio-enhance*`).

## New section structure (exact headings)

```text
## 10. Cost model and per-transcript cost drivers
   10.1 Scope and method
   10.2 Cost categories
   10.3 Cost drivers in execution order
        A. Pre-upload (browser, no server cost)
        B. Upload
        C. Credit deduction
        D. Transcription (AssemblyAI)
        E. Post-processing (Lovable AI, automatic)
        F. Lazy title generation (Lovable AI, on first view)
        G. Background storage / provider cleanup
        H. Post-conversion user actions (repeatable)
        I. Sharing & email
        J. Watchdog & retries
   10.4 Per transcript: how many AI calls can happen
        - Best case
        - Normal case
        - Max case (hard caps)
   10.5 Lovable AI usage — explicit summary
   10.6 AssemblyAI usage — explicit summary
   10.7 Export & PDF cost summary
   10.8 Optimisation opportunities
   10.9 Observability gaps and items needing verification
```

## Content to add — substance per subsection

### 10.1 Scope and method
- Documents per-transcript cost drivers based on edge functions and client modules in this repo (commit-current).
- "Cost" = any external billable call, storage write, bandwidth, or scheduled background work scaling per transcript / per user action.
- Excludes: fixed infra (Postgres baseline, hosting baseline, browser compute, `SpeechSynthesis` TTS — runs locally).

### 10.2 Cost categories (table)
| Category | What scales it | Provider |
|---|---|---|
| Speech-to-text | seconds of audio | AssemblyAI |
| LLM (post-process / Q&A / tags / title / translate / speaker review) | tokens × calls | Lovable AI Gateway |
| Object storage | audio temp blob, share-PDF blob, exports blob, avatars | Lovable Cloud Storage |
| Bandwidth | upload of audio, signed URL stream to AssemblyAI, PDF download streaming | Lovable Cloud egress |
| Background scheduling | pg_cron + edge invocations (`watchdog-stale-jobs`, `cleanup-assemblyai`, `process-email-queue`) | Lovable Cloud edge |
| Email delivery | enqueued message → Lovable Email infra | Lovable Email |

### 10.3 Cost drivers in execution order
For each driver document: **Where · Trigger · Frequency (once / once per action / repeatable) · Sync vs async · Provider · Avoidable / cacheable / dedupable**.

Ordered list to include (factual, drawn from code):

A. **Browser audio enhancement** — `enhanceAudioForTranscriptionAuto` in a Web Worker. No server cost. Affects file size (and therefore upload bandwidth + AAI billable seconds, which are based on duration not bytes — *needs verification that AAI bills only by duration regardless of bitrate*).

B. **Resumable upload to `temp-audio` bucket** — `resumableUpload` from Convert. Once per transcript. Storage write + ingress bandwidth. Audio is deleted at end of transcribe step, so net storage cost is short-lived (typically < pipeline duration).

C. **`process-job` invocation** — calls `deduct_credits` RPC (DB only, no provider cost), then triggers transcribe + post-process. Background (`EdgeRuntime.waitUntil`).

D. **`transcribe` edge function (AssemblyAI)**:
   - 1 `POST /transcript` (submit) + N `GET /transcript/:id` polls (every `poll_interval_ms`, default 5 s, up to `max_polls` = 120 → 10 min cap by default).
   - Poll calls are charged as API requests; transcription itself is billed per audio second — *needs verification of AAI's exact pricing dimensions for `universal-3-pro`, `language_detection`, `speaker_labels`, `multichannel`, `speech_threshold`, `disfluencies`, `keyterms_prompt`, `prompt`*.
   - 1 `DELETE /transcript/:id` after success (no extra billable processing on AAI side, but still an API call).
   - Heartbeat `UPDATE jobs … updated_at` every ~30 s (DB only).
   - 1 storage `remove(temp-audio)` after success.

E. **`post-process` edge function (Lovable AI)** — runs once per first-time transcript:
   - **1 call** — Summary, model `google/gemini-2.5-flash`.
   - **1 call** — Custom prompt output, model `google/gemini-3-flash-preview`. *Only if* `custom_prompt` was supplied at upload.
   - Then **`autoTag(...)`** (best-effort, swallows errors):
     - **1 call** — Tag generation, model `google/gemini-2.5-flash-lite` (skipped if transcript < 100 chars or no `user_id`).
     - **1 call** — Tag-language classification batch, model `google/gemini-2.5-flash-lite` (skipped if no candidate tags).
   - Inserts `notifications` row (DB only).

F. **`generate-title`** — invoked from `JobDetail` only when `!m.title && jobStatus === "completed"`. **1 call**, model `google/gemini-2.5-flash-lite`. Once per transcript in normal flow (idempotent: if `title` already set, never re-runs unless user clears it).

G. **Background cleanup**:
   - In-line `DELETE` to AssemblyAI + storage remove, both inside `transcribe`.
   - `cleanup-assemblyai` cron retries failed AAI deletions only (no per-job cost in healthy path).
   - `cleanup-stale-jobs` cron (verify schedule).

H. **Repeatable post-conversion user actions** (all consume 0 credits, all hit Lovable AI):
   - **Edit transcript → "Regenerate summary"** (`regenerate` with `output_type: 'summary_from_edit'`): **1 AI call** (`gemini-2.5-flash`). Hard-capped at **3 per transcript** (`summary_regen_count >= 3` → 403).
   - **Re-run summary in another language** (`regenerate` with `output_type: 'summary'`): 1 AI call (`gemini-2.5-flash`). No explicit cap — `regeneration_count` is incremented but never gated.
   - **Ask a question** (`regenerate` with `output_type: 'custom'`): **1 AI call** (`gemini-3-flash-preview`). Hard-capped at **`question_generation_count < 10`** (atomic `UPDATE … WHERE question_generation_count < 10`); a question is **billed before** the AI call and the counter is rolled back only if the AI call throws. **Editing a question and re-running it counts as a new execution** (each click is a new `regenerate` invocation that increments the counter).
   - **Translate all outputs** (`translate_all`): 1 AI call **per output that is missing or stale** (`source_hash` mismatch) — model `gemini-2.5-flash`. Translatable types: `transcript | summary | custom | question`. Variants are cached per `(job_output_id, language, source_hash)` and reused when the transcript hash is unchanged.
   - **Identify speakers** (`identify-speakers`): result is cached on `job_outputs.metadata` and re-served if present. On first run: deterministic extraction + selective AI escalation — **0 or 1 AI call** (`gemini-2.5-flash`) depending on whether deterministic candidates need escalation.
   - **Suggest speaker name** (`suggest-speakers`, called from `JobResults`): **1 AI call per invocation** (`gemini-2.5-flash-lite`). Repeatable per renaming attempt, no cap.
   - **Generate tags manually** (`generate-tags`): re-invokes `autoTag` — same 2-call pattern as in post-process. No cap (verify).

I. **Sharing & email**:
   - **PDF generation is fully client-side** (`src/lib/export-pdf.ts → generatePdfBlob` uses `jspdf` in the browser). No server CPU cost.
   - Sharing **with PDF** (`ShareButton.uploadPdfForShare`) uploads the client-built PDF blob to `shared-pdfs` bucket, then calls `share-transcript`, which:
     - Inserts `transcript_shares` row.
     - Renders HTML + plaintext server-side from existing DB outputs (no AI, no PDF re-rendering).
     - Enqueues 1 message in `transactional_emails` pgmq queue → 1 outbound email via `process-email-queue` → Lovable Email send.
   - Sharing **without PDF** (`share-transcript-record`): same minus the PDF upload and storage object.
   - **`download-shared-pdf`** streams the stored blob — egress bandwidth only (no AI, no PDF rebuild).

J. **Watchdog & retries** (`watchdog-stale-jobs`):
   - For stale `processing` / `uploading` jobs: marks failed, refunds via `add_credits` (DB), removes orphan temp audio (storage delete). No provider cost beyond a possible orphan storage object lingering until the sweep.

### 10.4 Per transcript: how many AI calls can happen

State explicitly:

- **Best case** (no custom prompt at upload, transcript already had a title — only possible via API path; in product UI title is auto-generated, so this is theoretical):
  - **3** Lovable AI calls: summary + auto-tag generate + auto-tag language classify.

- **Normal case** (account user, no custom prompt at upload, default behaviour):
  - **4** Lovable AI calls: summary + auto-tag generate + auto-tag language classify + lazy title generation on first JobDetail view.

- **Normal case + custom prompt at upload**: **5** Lovable AI calls.

- **Max case ceiling for one transcript across its lifetime** (caps from code):
  - First creation: 4–5 calls (above).
  - Up to **3** `summary_from_edit` regenerations.
  - Up to **10** custom-question generations (`question_generation_count < 10`; counter persists across edited reruns — *needs verification that we want edits-of-existing-Q to count toward the same cap*).
  - Uncapped: language re-summary, translate_all (capped by cache), suggest-speakers, identify-speakers (cached after first run), manual generate-tags.
  - Theoretical hard floor for the explicitly capped surface area = **17–18 AI calls**, plus uncapped repeatables.

### 10.5 Lovable AI usage — explicit summary

State plainly:
- Summary generation: **yes**, Lovable AI (`gemini-2.5-flash`), once at creation, plus on `summary_from_edit` (≤3) and on language re-summary.
- Title generation: **yes**, Lovable AI (`gemini-2.5-flash-lite`), once when first viewing a completed job without a title.
- Tag generation: **yes**, Lovable AI (`gemini-2.5-flash-lite`) + 1 batched language-classification call (same model).
- Q&A / custom analysis: **yes**, Lovable AI (`gemini-3-flash-preview`), capped at 10 per transcript.
- Edited & rerun questions: **yes, each click is a new AI call** and counts toward the 10-cap (each `regenerate` invocation atomically increments the counter).
- Transcript edits do **not** automatically trigger Lovable AI — they only flip `summary_needs_regen=true`; the AI call happens only when the user explicitly clicks "Regenerate summary".
- Translation: **yes**, Lovable AI (`gemini-2.5-flash`), but cached per `(output, language, source_hash)` — re-translating after edits invalidates only stale variants.
- Speaker review (`identify-speakers`): **yes, conditionally** — only escalates to Lovable AI (`gemini-2.5-flash`) if deterministic extraction yields ambiguous candidates; results cached.
- Speaker suggestions (`suggest-speakers`): **yes**, Lovable AI (`gemini-2.5-flash-lite`), per click.

### 10.6 AssemblyAI usage — explicit summary

- Single transcription job per upload: 1 `POST` + N polls + 1 `DELETE`, all under `transcribe` edge function.
- Cost dimensions in the request payload that may affect billing: `speech_models` (default `universal-3-pro`), `speaker_labels`, `multichannel`, `language_detection` + `language_confidence_threshold`, `disfluencies`, `keyterms_prompt`, `prompt`, `speaker_options`. **Needs verification** of which of these are billable add-ons under the current AAI plan.
- Audio is deleted from AAI after successful retrieval; orphaned cases are retried by `cleanup-assemblyai` cron.

### 10.7 Export & PDF cost summary

| Format | Where generated | Server cost |
|---|---|---|
| TXT | `src/lib/export-txt.ts`, browser | None |
| JSON | `src/lib/export-json.ts`, browser | None |
| DOCX | `src/lib/export.ts` via `docx` package, browser | None |
| PDF (download by owner) | `src/lib/export-pdf.ts` via `jspdf`, browser | None |
| PDF (share by email) | Same client-side `generatePdfBlob`, then **uploaded** to `shared-pdfs` bucket | Storage write + storage retention until manual cleanup (no automated TTL on the bucket — **needs verification**) + later egress on download |
| PDF (recipient download) | `download-shared-pdf` streams stored blob | Egress only (no PDF rebuild, no AI) |

Confirm explicitly: **no edge function rebuilds a PDF**; all PDF rendering is client-side.

### 10.8 Optimisation opportunities

- **Title generation race**: lazy invoke from `JobDetail` could double-fire if two tabs open the job concurrently — `generate-title` has no idempotency guard beyond the post-update check. Consider moving title into `post-process` to dedupe and remove the lazy-load round-trip.
- **Tag language classifier always runs**: `autoTag` LLM-classifies *every* candidate tag rather than only ASCII-suspicious ones. The previous heuristic (`looksEnglish`) is still in the file but unused. Re-enabling the heuristic for clearly-English tags would skip 1 LLM call per transcript when all tags are English.
- **`summary_from_edit` regenerates from scratch**: no diffing, full transcript sent to summary model. Acceptable but costs full prompt tokens each of the 3 allowed runs.
- **`translate_all` cache invalidation is whole-output**: editing the transcript (which changes `source_hash`) re-translates *all* outputs in the target language, including the summary even if it hasn't been regenerated yet. Per-output hashing (already keyed by `transcript` hash only) could be tightened.
- **Question counter rollback**: a Q&A AI call that throws after partial work still costs tokens upstream; current rollback only resets the DB counter. Consider streaming + abort for long Q&A.
- **PDF storage retention**: `shared-pdfs` blobs survive past the share's 2-day expiry — a cron sweep (analogous to `watchdog-stale-jobs`) for shares older than `expires_at` would reclaim storage.
- **Auto-tag + classifier are sequential**: 2 round-trips to the gateway. A single tool-calling prompt could return tags + per-tag language in one call.
- **Suggest-speakers is uncapped per click**: a debounce/cooldown or per-job daily limit would prevent runaway costs from a misbehaving UI.
- **AssemblyAI poll interval is 5 s**: shortening on the client wouldn't help (server-side poll), but raising for very long files would cut request count without affecting latency materially.

### 10.9 Observability gaps and items needing verification

Items the doc should explicitly flag as "needs verification":
- AAI per-feature pricing (which payload flags are paid add-ons under the current plan/region: EU vs US base URL).
- Lovable AI per-model billing units (token-based vs request-based) and whether `gemini-2.5-flash-lite` vs `gemini-3-flash-preview` differ materially per call.
- Whether the Question cap (10) was *intended* to count edits/reruns of an existing question, or only net-new questions.
- Retention policy + TTL of `shared-pdfs` and `exports` buckets — currently no scheduled cleanup function found.
- Schedule + frequency of `cleanup-stale-jobs` and `watchdog-stale-jobs` cron jobs (assumed every 5 min from comments, not verified against `pg_cron`).
- Whether `audio_enhancement` ever changes AAI billable seconds (it changes file size, but AAI is duration-based).
- Whether `process-email-queue` tick rate / dispatch (every 5 s by default per knowledge base) applies here as configured.

Add a paragraph at the end explaining there is currently **no per-job aggregated cost log** — provider costs are only recoverable from AAI and Lovable AI dashboards, not joined to `jobs.id`. Suggest a future `job_cost_events` append-only table fed by each edge function as a follow-up.

## Files touched

- `docs/ARCHITECTURE.md` — append the new `## 10.` section before the trailing `_Last updated …_` paragraph; update that paragraph to mention the new section.

No code changes, no migrations, no UI changes.

