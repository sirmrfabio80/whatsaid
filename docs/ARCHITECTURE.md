# WhatSaid — Architecture

> Living reference for the WhatSaid web app. Source of truth for runtime
> behaviour, data model, branding, and conventions. Update this file when
> any of the listed surfaces change.

---

## 1. Product overview

WhatSaid converts uploaded audio (`.m4a`, `.mp3`, `.wav` — up to 100 MB,
≤ 480 minutes) into:

1. A full transcript with timestamps and speaker labels.
2. A structured summary (key points + key actions).
3. Q&A answers grounded on the transcript.
4. Tags, title, recording date / location metadata.

Two flows:

- **Account flow** (primary): users sign up, buy credit packs, persist a
  history of jobs, share results.
- **Guest flow** (currently disabled in pricing UI): one-off pay-per-job
  upload-first / pay-later via guest token.

Audio is **deleted from storage immediately after processing**
(`audio_deleted_at` is recorded on the `jobs` row). Only generated text +
metadata is retained.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Build | Vite 5 + React 18 + TypeScript 5 |
| UI | Tailwind CSS v3 + shadcn/ui (Radix primitives) |
| State | `@tanstack/react-query`, React Context (Auth, Notifications) |
| Routing | `react-router-dom` |
| i18n | `react-i18next` (EN, IT, FR) |
| Backend | Lovable Cloud (Supabase: Postgres + Auth + Storage + Edge Functions) |
| STT | AssemblyAI (via the `transcribe` edge function) |
| LLM post-processing | Lovable AI Gateway (Gemini / GPT-5 family) |
| Payments | Paddle (merchant of record) — see `paddle-webhook` |
| Email | Internal queue (`pgmq`) drained by `process-email-queue` |
| TTS playback | Browser `SpeechSynthesis` (no server audio) |

---

## 3. Top-level routes

Defined in `src/App.tsx`. All non-landing routes are lazy-loaded.

| Path | Component | Purpose |
|---|---|---|
| `/` | `pages/Index` | Landing |
| `/login`, `/signup`, `/reset-password`, `/set-password` | auth pages | Email + Google OAuth |
| `/convert` | `pages/Convert` | Upload audio, choose language / template |
| `/history` | `pages/History` | Filterable list of past jobs |
| `/job/:id` | `pages/JobDetail` | Tabs: Transcript / Summary / Questions; Listen, Copy, Export, Share |
| `/profile` | `pages/Profile` | Avatar, display name, stats |
| `/settings` | `pages/Settings` | Account, UI language, **Listening (voice + speed)**, password, danger zone |
| `/pricing` | `pages/Pricing` | Credit packs |
| `/notifications` | `pages/Notifications` | Async job & PDF export notifications |
| `/help` | `pages/Help` | Capabilities, workflow, FAQ, troubleshooting |
| `/admin` | `pages/Admin` | Admin-only: edge logs, templates, watchdog, FAQ feedback |
| `/claim/:token` | `pages/ClaimShare` | Recipient claims a shared transcript |
| `/shared-pdf/:token` | `pages/SharedPdfDownload` | One-shot signed PDF download |
| `/privacy`, `/terms`, `/refund-policy` | static legal pages | |

Providers wrap the tree in this order:
`QueryClientProvider → TooltipProvider → BrowserRouter → AuthProvider →
NotificationsProvider`.

---

## 4. Branding & design system

The visual system is centralised in **`src/index.css`** (CSS custom
properties, all HSL) and **`tailwind.config.ts`** (token mapping +
typographic scale). Components must consume semantic tokens
(`bg-primary`, `text-foreground`, etc.) — never hard-coded colors.

### 4.1 Colors (semantic tokens)

All values are HSL triplets stored as `--token: H S% L%` and consumed via
`hsl(var(--token))`.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `220 20% 97%` | `225 25% 7%` | App canvas |
| `--foreground` | `220 25% 10%` | `210 20% 95%` | Primary text |
| `--card` | `0 0% 100%` | `225 20% 10%` | Card surfaces |
| `--popover` | `0 0% 100%` | `225 20% 10%` | Popovers, menus, tooltips |
| **`--primary`** | **`245 50% 48%`** | **`245 60% 64%`** | **Brand indigo** — CTAs, focus ring |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` | On-primary text |
| `--secondary` | `220 15% 93%` | `225 18% 15%` | Subtle surfaces |
| `--muted` | `220 15% 95%` | `225 18% 15%` | Quiet backgrounds |
| `--muted-foreground` | `220 10% 45%` | `215 15% 60%` | Helper text, captions |
| **`--accent`** | **`170 55% 42%`** | **`170 50% 48%`** | **Brand teal** — secondary highlights |
| `--destructive` | `0 72% 55%` | `0 65% 48%` | Delete / danger |
| `--success` | `145 60% 38%` | `145 50% 42%` | Success states |
| `--warning` | `38 90% 50%` | `38 80% 52%` | Warning states |
| `--info` | `210 60% 50%` | `210 55% 55%` | Informational |
| `--border`, `--input` | `220 15% 88%` | `225 15% 20%` | Hairlines, inputs |
| `--ring` | matches `--primary` | matches `--primary` | Focus ring |

A `--sidebar-*` mirror set is reserved for the optional shadcn sidebar
component.

`--radius: 0.75rem` drives the Tailwind border-radius scale.

### 4.2 Typography

Two web families only, declared in `tailwind.config.ts → fontFamily`:

| Family | Tailwind alias | Purpose |
|---|---|---|
| **Inter** (variable) | `font-sans` (default) | UI chrome, headings, navigation, form labels, timestamps |
| **Source Serif 4** (variable, optical-size) | `font-serif` | Long-form reading: transcript body, summary, Q&A |

Mono uses the **system stack** (`ui-monospace, SFMono-Regular, …`). No
third loaded family. A `Source Serif 4 Fallback` `@font-face` (mapping
to local Georgia with `size-adjust: 102%`) is registered to minimise CLS
during font swap.

Type scale (`tailwind.config.ts → fontSize`):

| Token | Size | Line | Weight | Use |
|---|---|---|---|---|
| `display` | 2.25rem | 1.05 | 600 | Hero headline |
| `h1` | 1.5rem | 1.2 | 600 | Page title |
| `h2` | 1.125rem | 1.3 | 600 | Card title |
| `h3` | 1rem | 1.35 | 600 | Subsection |
| `reading` | 1rem | 1.7 | 400 | Long-form (paired with `font-serif`) |
| `body` | 0.9375rem | 1.6 | 400 | Default body |
| `body-sm` | 0.8125rem | 1.5 | 400 | Dense UI text |
| `caption` | 0.75rem | 1.4 | 500 | Helper text |
| `micro` | 0.6875rem | 1.3 | 600 (tracked +0.04em) | Labels / overlines |
| `button`, `button-sm` | 0.875rem / 0.8125rem | 1 | 500 | Buttons |

Body has `font-feature-settings: "ss01", "cv11", "cv05"` enabled for
Inter's stylistic alternates; `.font-serif` opts into `kern, liga, calt`.

### 4.3 Motion

- Page transitions: `.animate-page-enter` (translate + fade) for landing,
  `.animate-page-enter-flat` (fade only) for app pages.
- Decorative animations: `pulse-ring`, `slide-down`, `waveform-scroll`,
  `progress-fill-92`, `hero-mock-rise`, `hero-text-rise` (defined in
  `tailwind.config.ts`).
- All non-functional motion is suppressed via a
  `@media (prefers-reduced-motion: reduce)` block; `animate-spin` and
  Radix interaction transitions are preserved.

### 4.4 Glass / depth

Reserved for the navbar only — `.glass-navbar` (light / dark) provides
backdrop-filter blur + saturate. Other surfaces stay solid for legibility.

### 4.5 Focus & interaction

Global `:focus-visible` ring: 2px background offset + 2px `--ring` halo.
Buttons get `transform: scale(0.98)` on `:active`. Tap targets ≥ 44 px on
mobile.

---

## 5. Data model

All tables live in the `public` schema. RLS is enabled everywhere; users
can only access their own rows except where noted. Roles are stored in a
**dedicated `user_roles` table**, never on `profiles`.

### 5.1 Identity & roles

- **`profiles`** — one row per user. Editable fields:
  `display_name`, `email` (contact), `avatar_url`, `ui_language`
  (`en`|`it`|`fr`), `needs_password_setup`, **`preferred_voice`** (`'male'|'female'`,
  default `'female'`, `CHECK`), **`playback_speed`** (`real`, default
  `1.0`, `CHECK IN (0.75, 1.0, 1.25, 1.5)`).
  RLS: user can `SELECT` / `INSERT` / `UPDATE` own row (`auth.uid() =
  user_id`); no `DELETE`.
- **`user_roles`** — `(user_id, role)` with `app_role` enum
  (`admin | moderator | user`). Admin-only management; users can read
  their own roles. Use the `has_role(_user_id, _role)` security-definer
  function in RLS predicates to avoid recursion.

### 5.2 Credits & billing

**Credit model (source of truth: `src/lib/pricing.ts → creditsForDuration`).**
Pricing is **per file**, not per minute or per bracket: a single credit
buys a full transcription for any file up to **120 minutes**. Files
longer than 120 min cost **+1 credit per additional 120-min block**.
The hard ceiling per file is **480 minutes** (`MAX_DURATION = 480 * 60`
in `src/lib/pricing.ts`), so a single upload can cost at most 4 credits.

```
creditsForDuration(seconds) = max(1, ceil(seconds / 60 / 120))
```

| Duration | Credits charged |
|---|---|
| 0 – 120 min | 1 |
| 121 – 240 min | 2 |
| 241 – 360 min | 3 |
| 361 – 480 min | 4 |

A single charge covers the full pipeline for that job: **transcript +
structured summary + Q&A + tags + title**. Regenerating the summary,
asking additional questions, generating tags, or translating outputs
costs **0 additional credits** — none of those edge functions
(`regenerate`, `post-process`, `generate-tags`, `generate-title`,
`translate-tags`) call `deduct_credits`. Counters
(`regeneration_count`, `summary_regen_count`, `question_generation_count`)
exist for analytics / abuse limiting only.

**Charge lifecycle:**
1. `pages/Convert` computes `credits = creditsForDuration(duration)` and
   inserts the `jobs` row with `credits_charged = credits`,
   `status = 'uploading'`. No deduction yet.
2. `process-job` (edge) is invoked. Before any provider work it calls
   `rpc('deduct_credits', { p_user_id, p_amount: credits_charged, p_job_id })`.
   The RPC is atomic (`UPDATE … WHERE balance >= p_amount RETURNING …`)
   so two concurrent jobs cannot over-spend a balance.
3. If the deduct returns `false`, the job is marked `failed` with
   `error_message = 'Insufficient credits'` and 402 is returned.
4. If the job later goes stale, `watchdog-stale-jobs` calls `add_credits`
   with the same `credits_charged` to refund the user.
5. **Admins** (`user_roles.role = 'admin'`) bypass deduction entirely
   in both `process-job` and the watchdog refund path.

**Pricing packs (`src/lib/paddle-pricing.ts → PRICING_PRODUCTS`).**
All prices are GBP base (other currencies via Paddle `PricePreview`,
with a `.99-rounded` GBP→FX fallback if Paddle.js is unavailable):

| Pack | Credits | Base price | Paddle price ID |
|---|---|---|---|
| `one-time` | 1 | £4.99 | `pri_01kp91g9954gq9a4k080fdgedw` |
| `5-pack` (highlighted) | 5 | £14.99 | `pri_01kp91hv62g2nx9jxqta2766hf` |
| `20-pack` | 20 | £39.99 | `pri_01kp91m77g15bhgemezzcsvh2n` |

Packs sell credits, and **1 credit = 1 transcription up to 120 min**, so
a 5-pack covers 5 standard transcriptions (or fewer transcriptions if
some files exceed 120 min and consume multiple credits each).

**Tables backing the model:**

- **`credit_balances`** — current balance per user. SELECT-only for
  users; mutated by SECURITY DEFINER RPCs `add_credits()` /
  `deduct_credits()`.
- **`credit_transactions`** — append-only ledger of every add/deduct
  event with `reason`, optional `job_id`, `stripe_session_id` (legacy
  column, also reused for Paddle transaction IDs — see
  `paddle-webhook` line 161).
- **`pending_invites`** — admin-issued credit grants pending account
  creation, claimed via the `redeem-invite` edge function.


### 5.3 Jobs & outputs

- **`jobs`** — central job record. Key columns:
  - identity: `user_id` (nullable for guest), `guest_token`, `guest_email`
  - status: `status` enum (`pending | uploading | processing | completed | failed`),
    `error_message`
  - input: `file_name`, `file_size_bytes`, `duration_seconds`,
    `temp_file_path`, `audio_channels`, `audio_deleted_at`
  - language: `language_selected`, `language_detected`,
    `summary_language`, `output_language`
  - results: `title`, `short_summary`, `speaker_names` (jsonb map)
  - billing: `credits_charged`, `stripe_payment_id`
  - regen counters: `regeneration_count`, `summary_regen_count`,
    `question_generation_count`, `summary_needs_regen`
  - provider: `assemblyai_transcript_id`, `assemblyai_delete_status`,
    `speech_model`, `transcription_config` (jsonb)
  - metadata: `recorded_at`, `recorded_at_source`,
    `metadata_apple_creationdate`, `metadata_mvhd_creation`,
    `metadata_file_lastmodified`, `metadata_location_iso6709`,
    `location_label`
- **`job_outputs`** — one row per generated artifact (`output_type` =
  `transcript | summary | question | …`), `content` text + optional
  `custom_prompt`, `metadata` jsonb, `raw_response` jsonb.
- **`job_output_variants`** — translated cached variants of an output
  keyed by `(job_output_id, language, source_hash)`.
- **`tags`** + **`job_tags`** — user-scoped tags + many-to-many join.
- **`tag_translations`** — global cache of normalised tag → target-lang
  translations. Authenticated reads, service-role writes.
- **`tag_quality_flags`** — admin-only queue of flagged auto-tags
  pending fix / translation.

### 5.4 Sharing

- **`transcript_shares`** — `(token, job_id, recipient_email,
  expires_at = now() + 2 days, claimed, claimed_by, claimed_job_id)`.
  Created by `share-transcript-record`, claimed via `claim-transcript-share`,
  one-shot PDF served by `download-shared-pdf`.

### 5.5 Async, notifications, email

- **`async_jobs`** — generic async work queue (job_type, status, title,
  resource link). Drives the in-app notification bell for long-running
  exports / sharing.
- **`notifications`** — user-scoped feed (`type, status, title,
  description, async_job_id, resource_*, read`).
- **`email_send_log`**, **`email_send_state`**,
  **`email_unsubscribe_tokens`**, **`suppressed_emails`** — internal
  email pipeline backing `auth-email-hook` and `process-email-queue`.

### 5.6 Help & admin

- **`help_faq_feedback`** — anonymous-or-auth helpful/not-helpful votes
  per `(faq_anchor, locale)`. Anyone can `INSERT` (regex-validated);
  admins can `SELECT`.
- **`transcribe_settings_templates`** — admin-managed AssemblyAI request
  presets (`config` jsonb, `is_active`).

### 5.7 RPCs (SECURITY DEFINER)

- `has_role(_user_id, _role)` — RLS-safe role check.
- `add_credits(p_user_id, p_amount, p_reason, p_stripe_session_id?)`
- `deduct_credits(p_user_id, p_amount, p_reason, p_job_id?)`
- `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq` —
  `pgmq` wrappers used by the email worker.

### 5.8 Storage

Private buckets only. Audio uploads land in a temp-prefixed path
referenced by `jobs.temp_file_path` and are deleted by `process-job`
(and by `cleanup-assemblyai` / `cleanup-stale-jobs` watchdogs) after
transcription. The `avatars` bucket is public for profile images.

---

## 6. Edge functions

Located under `supabase/functions/`. All HTTP-callable functions deploy
automatically; default `verify_jwt` policy lives in `supabase/config.toml`.

| Function | Purpose |
|---|---|
| `transcribe` | Submit audio to AssemblyAI; persist job config |
| `process-job` | Poll AssemblyAI, write transcript, trigger post-processing, delete audio |
| `post-process` | Generate summary + tags + title via Lovable AI |
| `regenerate` | Re-run summary or Q&A on existing transcript |
| `generate-tags`, `generate-title` | Targeted single-output regen |
| `suggest-speakers`, `identify-speakers` | Speaker-naming heuristics + LLM |
| `translate-tags`, `scan-non-english-tags`, `fix-flagged-tags` | Tag i18n maintenance |
| `share-transcript`, `share-transcript-record`, `claim-transcript-share`, `download-shared-pdf` | Sharing pipeline |
| `paddle-webhook` | Verifies Paddle events → adds credits via `add_credits` |
| `invite-user`, `redeem-invite` | Admin-issued credit invites |
| `validate-profile-email` | Pre-save email uniqueness check |
| `delete-account` | Cascading account + storage cleanup |
| `auth-email-hook`, `process-email-queue` | Outbound transactional + auth email pipeline |
| `cleanup-assemblyai`, `cleanup-stale-jobs`, `watchdog-stale-jobs` | Scheduled cleanup |
| `admin-get-job-details` | Admin-only deep job inspection |

`_shared/` holds CORS, Supabase client, prompts, sanitizers, AI Gateway
helper, and email templates.

---

## 7. Client architecture

### 7.1 Folder layout (key)

```
src/
  components/        Feature components (PascalCase) + ui/ shadcn primitives
  contexts/          AuthContext, NotificationsContext
  hooks/             use-speech-synthesis, use-history-filters, use-job-tags, …
  pages/             Route components
  lib/               Pure helpers (export, transcript, pricing, time-format, …)
  i18n/              i18next config + locales/{en,fr,it}.json
  content/help/      FAQ, features, workflow, troubleshooting (typed, multi-locale)
  integrations/
    supabase/        client + auto-generated types (DO NOT EDIT types.ts)
  test/              Vitest suites
```

### 7.2 State conventions

- Server state → `react-query` (queries keyed by `[entity, id]`).
- Cross-cutting auth/profile → `AuthContext` (also seeds the speech
  manager singleton with the user's listening preferences after profile
  load — single source of truth).
- Notifications stream → `NotificationsContext` with realtime subscription.
- Local UI state → component-local `useState` / `useReducer`.

### 7.3 Speech (Listen) playback

- `src/hooks/use-speech-synthesis.ts` exposes a **module-level singleton
  manager** wrapping `window.speechSynthesis`. Only one playback session
  exists across the page; individual `ListenButton` unmounts only
  unsubscribe — they never cancel speech.
- Preferences (`preferred_voice`, `playback_speed`) live in module scope,
  seeded once per session by `AuthContext.refreshProfile`.
- `pickVoice(lang, gender)` matches in this order: exact lang → lang
  family → `localService` → name-based gender heuristic → browser
  default. Gender matching is best-effort (browser metadata is
  inconsistent).
- Long text is split via `chunkForSpeech()` (paragraph → sentence →
  comma, ≤ 600 chars/chunk) and a 10 s pause/resume heartbeat keeps
  Chrome from cutting off long utterances.
- `Settings → Listening` lets users override voice + speed and preview
  via a Test action; the matched voice name is shown live under the
  selector. A "Learn more" link deep-links to the Account FAQ entry.

### 7.4 i18n

- `src/i18n/index.ts` configures `react-i18next` with EN, IT, FR.
- Locale resolution uses the user's `profiles.ui_language` when signed
  in, falling back to browser detection.
- All user-facing strings live in `src/i18n/locales/{en,fr,it}.json`.
  **Always add a key in all three locales when introducing copy.**

### 7.5 Help content & drift guards

- `src/content/help/{faq,features,workflow,troubleshooting}.ts` are the
  runtime sources for the Help page (typed `Localized<T>` records).
- `docs/product/capabilities.md` is the canonical capability registry
  (`CAP-001 …`).

### 7.6 Drift guards

Three Node scripts (no extra deps) act as guard rails between the
source of truth (code, capability registry) and the docs that describe
them. Run them all locally with **`npm run docs:check:all`**; CI uses
the same entrypoint.

| Script | npm alias | Protects against |
|---|---|---|
| `scripts/check-capabilities-sources.mjs` | `docs:check` | Stale `**Source files:**` paths in `docs/product/capabilities.md` (file renamed/deleted but doc not updated). |
| `scripts/check-help-faq-coverage.mjs` | `docs:check:faq` | Public capability with non-empty `FAQ seeds` that has no matching entry in `src/content/help/faq.ts` (`caps:[]`), or an FAQ entry referencing a non-existent capability ID. |
| `scripts/check-design-tokens-drift.mjs` | `docs:check:tokens` | Color tokens (`:root` / `.dark` HSL triplets in `src/index.css`), preferred font families, and the type scale (`tailwind.config.ts → fontSize` — name + size + lineHeight + non-default fontWeight) drifting from §4.1 / §4.2 of this document. |

When a guard fails, the fix is almost always **update the doc** (the
code is the source of truth). Only revert the source change if the
drift was unintentional.

---

## 8. Conventions

- **Tokens not literals.** No raw color or font literals in components —
  always semantic Tailwind classes.
- **HSL only** for color tokens. New colors must be added to both
  `index.css` and `tailwind.config.ts`.
- **RLS first.** Every new table must enable RLS and ship policies in
  the same migration. Roles live in `user_roles`, not `profiles`.
- **Validation before persistence.** Validate enum-like values
  client-side before any `update()` call so the DB `CHECK` constraints
  are never the first line of defence.
- **Auto-generated files are off-limits:**
  `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`,
  `.env`, and `supabase/migrations/*` (use the migration tool).
- **Accessibility:** every interactive element needs an accessible
  label, ≥ 44 px tap target on mobile, visible focus, `aria-live`
  feedback for async toasts, respect for `prefers-reduced-motion`.
- **i18n parity:** EN, IT, FR keys must stay in sync. Add to all three
  files when adding copy.
- **Privacy:** never persist raw audio beyond the processing window.
  `audio_deleted_at` must be set when the audio file is removed.

---

## 9. Reference: key external dependencies

- **AssemblyAI** — STT provider. Templates live in
  `transcribe_settings_templates`; deletion lifecycle in
  `cleanup-assemblyai`.
- **Lovable AI Gateway** — model access for summaries / Q&A / tags /
  speaker identification (no user-supplied API key required).
- **Paddle** — merchant of record for credit purchases. Webhook signature
  verification in `paddle-webhook`; pricing model in `mem://features/pricing`.

---

_Last updated when listening preferences (voice + speed) and the
matched-voice indicator landed. Refresh this document whenever you
touch the data model, design tokens, edge function surface, or
high-level flows._
