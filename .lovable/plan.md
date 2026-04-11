

# WhatSaid -- Sequenced Implementation Prompts

## What is already built
- Database schema: profiles, credit_balances, credit_transactions, jobs, job_outputs, storage bucket, RLS, atomic credit functions
- UI shell: Navbar (glass, avatar dropdown, mobile), Homepage (hero, stats, how-it-works, capabilities, pricing, trust, footer), Convert page (upload + configure + confirm steps), Login/Signup, Profile, Settings, Credits, History
- Auth context with credit balance refresh
- Pricing logic in `src/lib/pricing.ts`
- Language selector component with 99 languages

## What remains
Backend integration (Stripe, AssemblyAI, Lovable AI), guest token flow, processing states, results display, audio deletion, and polish.

---

## Build Order and Prompts

### Step 1 -- Enable Stripe connector
**Do this in the Lovable UI, not via a prompt.** Go to Connectors and enable Stripe. This provisions the Stripe secret keys needed by edge functions.

---

### Step 2 -- Stripe checkout edge function for guest one-off payments
**Prompt:**
> Create an edge function called `create-checkout` that accepts `{ mode: "guest", duration_tier: "short" | "medium" | "long", job_id: string }` or `{ mode: "credits", pack_index: number, user_id: string }`. For guest mode, create a Stripe Checkout session with the correct price ($2.99 / $4.99 / $7.99) using `payment` mode. For credits mode, create a session for the matching credit pack. Include `job_id` or `pack_index` in Stripe metadata. Return the checkout URL. Use the STRIPE_SECRET_KEY secret. Set success_url to `{origin}/convert?session_id={CHECKOUT_SESSION_ID}` for guests and `{origin}/credits?session_id={CHECKOUT_SESSION_ID}` for credit packs.

**Files touched:** `supabase/functions/create-checkout/index.ts`

---

### Step 3 -- Stripe webhook edge function
**Prompt:**
> Create an edge function called `stripe-webhook` that verifies the Stripe signature using STRIPE_WEBHOOK_SECRET, handles `checkout.session.completed` events. If metadata contains `job_id`, update the job status from `pending` to `uploading` (guest payment confirmed). If metadata contains `pack_index`, call the `add_credits` database function with the correct credit amount for the user. Use the service role key for database writes. Do not process any other event types.

**Files touched:** `supabase/functions/stripe-webhook/index.ts`

---

### Step 4 -- Wire Stripe into Convert page (guest flow)
**Prompt:**
> On the Convert page, when a guest (no user) clicks "Pay and convert", create a job row via edge function or direct insert with `status: 'pending'` and `guest_token`, then call the `create-checkout` edge function with `mode: "guest"` and the `job_id`. Redirect to the Stripe checkout URL. On return (when `session_id` is in the URL params), show a "Payment confirmed, uploading..." state. Upload the audio file from browser memory to Supabase Storage at `guest/{job_id}/{filename}`, then update the job's `temp_file_path` and status to `uploading`. Do not start transcription yet -- that will be a separate step. Only modify `src/pages/Convert.tsx`.

**Files touched:** `src/pages/Convert.tsx`

---

### Step 5 -- Wire Stripe into Convert page (account credit flow)
**Prompt:**
> On the Convert page, when a logged-in user clicks "Use X credits and convert", call the `deduct_credits` database function. If it returns true, upload the audio file to Supabase Storage at `{user_id}/{job_id}/{filename}`, create the job row with `status: 'uploading'`, and update `temp_file_path`. Refresh the credit balance in AuthContext. If deduction fails, show a toast error. Only modify `src/pages/Convert.tsx`.

**Files touched:** `src/pages/Convert.tsx`

---

### Step 6 -- Wire Stripe into Credits page (credit pack purchase)
**Prompt:**
> On the Credits page, when a user clicks "Buy X credits", call the `create-checkout` edge function with `mode: "credits"` and redirect to the Stripe checkout URL. On return with `session_id` in URL params, show a success toast and refresh the credit balance from AuthContext. Only modify `src/pages/Credits.tsx`.

**Files touched:** `src/pages/Credits.tsx`

---

### Step 7 -- AssemblyAI transcription edge function
**Prompt:**
> Create an edge function called `transcribe` that: (1) Receives `{ job_id: string }`. (2) Reads the job row to get `temp_file_path` and `language_selected`. (3) Creates a signed URL for the audio file in Supabase Storage. (4) Submits to AssemblyAI's `/v2/transcript` endpoint with `audio_url`, `speaker_labels: true`, and `language_code` (if language_selected is not "auto", pass it; otherwise omit for auto-detection). (5) Polls AssemblyAI `/v2/transcript/{id}` every 5 seconds until status is `completed` or `error`. (6) On completion: updates the job with `status: 'processing'`, `language_detected`, `duration_seconds` from AssemblyAI response. Inserts a `job_outputs` row with `output_type: 'transcript'` containing the full text with speaker labels. (7) Deletes the audio file from Supabase Storage and sets `audio_deleted_at`. (8) On error: updates job `status: 'failed'` with `error_message`. Use ASSEMBLYAI_API_KEY secret. Use the service role key for all database operations.

**Files touched:** `supabase/functions/transcribe/index.ts`

---

### Step 8 -- Lovable AI post-processing edge function
**Prompt:**
> Create an edge function called `post-process` that: (1) Receives `{ job_id: string, custom_prompt?: string }`. (2) Reads the transcript from `job_outputs` where `output_type = 'transcript'`. (3) Calls Lovable AI (Gemini 2.5 Flash) twice: once for a summary with key actions, once for the custom prompt output (if provided). (4) Inserts `job_outputs` rows for `output_type: 'summary'` and `output_type: 'custom'`. (5) Updates job `status: 'completed'`. Use LOVABLE_API_KEY. Use service role key for database.

**Files touched:** `supabase/functions/post-process/index.ts`

---

### Step 9 -- Orchestration: trigger transcribe then post-process
**Prompt:**
> Create an edge function called `process-job` that orchestrates the full pipeline: (1) Receives `{ job_id: string, custom_prompt?: string }`. (2) Updates job status to `processing`. (3) Calls the `transcribe` function and waits for completion. (4) If transcription succeeded, calls the `post-process` function. (5) Returns the final job status. Modify `src/pages/Convert.tsx` so that after audio upload completes (both guest and account flows), it calls `process-job` and shows a polling UI that checks job status every 3 seconds. Display progress states: "Transcribing..." → "Generating summary..." → "Complete".

**Files touched:** `supabase/functions/process-job/index.ts`, `src/pages/Convert.tsx`

---

### Step 10 -- Results display on Convert page
**Prompt:**
> On the Convert page, after job status reaches `completed`, fetch all `job_outputs` for the job. Display results in tabs: Transcript, Summary, AI Output. Each tab shows the content text and a "Copy" button. Show a language badge with the detected language. For guests, show the guest_token URL they can bookmark. For logged-in users, show a link to History. Add a "Download as TXT" button per tab. Only modify `src/pages/Convert.tsx`.

**Files touched:** `src/pages/Convert.tsx`

---

### Step 11 -- Guest token results page
**Prompt:**
> Create a new page at `/job/:token` that loads a job by `guest_token` (add an RLS policy or edge function that allows selecting a job and its outputs by guest_token without auth). Display the same results tabs as the Convert page results step. Show a banner: "This link expires in 30 days. Create an account to keep results permanently." Add the route to `src/App.tsx`.

**Files touched:** `src/pages/JobResult.tsx`, `src/App.tsx`, possibly a migration for guest-token RLS policy

---

### Step 12 -- History page with real data
**Prompt:**
> Update the History page to fetch real jobs from the database for the logged-in user. Show a list of jobs with: file name, duration, status (badge), date, credits charged, detected language. Clicking a job navigates to `/job/:id` showing the outputs. Add a job detail page at `/job/:id` for authenticated users that fetches job + outputs and displays them in the same tab layout. Only modify `src/pages/History.tsx` and create `src/pages/JobDetail.tsx`. Add routes to `src/App.tsx`.

**Files touched:** `src/pages/History.tsx`, `src/pages/JobDetail.tsx`, `src/App.tsx`

---

### Step 13 -- Regeneration flow
**Prompt:**
> On the job results view (both `/job/:token` and `/job/:id`), add a "Regenerate" button on the Summary and AI Output tabs. When clicked: check `regeneration_count` on the job. If under 2, call `post-process` with the new/existing custom prompt and increment `regeneration_count`. If 2+, for guests show "Create an account for more regenerations". For account users, attempt to deduct 0.5 credits (round: deduct 1 credit for every 2 regenerations -- track with a counter). Show a confirmation dialog before charging. Modify the job results components only.

**Files touched:** Job result/detail components

---

### Step 14 -- Profile and Settings with persisted language preference
**Prompt:**
> Add a `default_language` column to the profiles table (migration). Update the Settings page so the language selector saves to the profile. Update the Convert page so it reads the user's default language from their profile as the initial value for the language selector. Only modify `src/pages/Settings.tsx`, `src/pages/Convert.tsx`, and add a migration.

**Files touched:** `src/pages/Settings.tsx`, `src/pages/Convert.tsx`, migration

---

### Step 15 -- Cleanup and deletion lifecycle audit
**Prompt:**
> Review and harden the audio deletion lifecycle: (1) Verify the `transcribe` edge function deletes audio from Storage immediately after AssemblyAI returns. (2) Add a scheduled cleanup: create an edge function called `cleanup-temp` that deletes any files in `temp-audio` bucket older than 1 hour (safety net for failed jobs). (3) Verify all job rows have `audio_deleted_at` set after processing. Only create/modify edge functions.

**Files touched:** `supabase/functions/cleanup-temp/index.ts`, verify `transcribe` function

---

### Step 16 -- Homepage and UI polish
**Prompt:**
> Polish the homepage: (1) Add subtle entrance animations to hero elements using CSS keyframes (fade-in + slide-up, staggered). (2) Ensure the pricing section shows the user's current credit balance if logged in. (3) Add a "Privacy" and "Terms" link in the footer (can be placeholder pages). (4) Test and fix any dark mode contrast issues on glass surfaces. Only modify `src/pages/Index.tsx` and `src/index.css`.

**Files touched:** `src/pages/Index.tsx`, `src/index.css`

---

## Summary Table

| Step | Concern | Files | Needs external setup? |
|------|---------|-------|-----------------------|
| 1 | Stripe connector | None (UI action) | Yes -- enable in Lovable |
| 2 | Stripe checkout edge fn | 1 edge function | Needs STRIPE_SECRET_KEY |
| 3 | Stripe webhook edge fn | 1 edge function | Needs STRIPE_WEBHOOK_SECRET |
| 4 | Guest payment UI | Convert.tsx | -- |
| 5 | Account credit UI | Convert.tsx | -- |
| 6 | Credit pack purchase UI | Credits.tsx | -- |
| 7 | AssemblyAI transcription | 1 edge function | Needs ASSEMBLYAI_API_KEY |
| 8 | Lovable AI post-processing | 1 edge function | -- |
| 9 | Orchestration + progress UI | 1 edge fn + Convert.tsx | -- |
| 10 | Results display | Convert.tsx | -- |
| 11 | Guest token page | New page + route | Migration |
| 12 | History with real data | History.tsx + new page | -- |
| 13 | Regeneration flow | Result components | -- |
| 14 | Persisted language pref | Settings + Convert + migration | Migration |
| 15 | Deletion lifecycle | Edge functions | -- |
| 16 | Homepage polish | Index.tsx + CSS | -- |

