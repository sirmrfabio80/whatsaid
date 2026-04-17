

## Plan: Add "Logs" tab in Admin to inspect last job

### Goal
Add a second tab in `/admin` next to "Transcribe settings" called **Logs** that shows the most recent job's full details — including the AssemblyAI request payload sent and the raw response received — formatted intelligently for a technical admin audit.

### What gets shown (organized top-to-bottom)

**1. Header strip** — quick-scan facts
- Job title + file name, status badge, created_at (relative + absolute), duration, language detected vs selected, country (if logged), region/base URL used.

**2. Routing & language audit** (the part that triggered recent debugging)
- `language_selected` (user choice) → `language_code` requested → `language_detected` (AAI returned)
- Visual flag if user-forced language ≠ detected language
- Geo-routing: country header → resolved base URL
- Strategy resolved (e.g. "recovery"), route (mono/multichannel), prompt applied yes/no

**3. AssemblyAI request** — collapsible, syntax-highlighted JSON
- Full `transcription_config` payload exactly as built by the edge function (already stored on `jobs.transcription_config`).
- Copy-to-clipboard button.

**4. AssemblyAI response** — collapsible, syntax-highlighted JSON
- Raw response stored on `job_outputs.raw_response` for the transcript output.
- Pretty-printed, copy button, optional "show only top-level keys" collapse for huge payloads.

**5. Post-processing outputs** — compact list
- One row per `job_outputs` entry (transcript, summary, custom): output_type, language, char count, created_at. Click to expand `content` + `metadata`.

**6. Recent edge function logs for this job** (bonus, very useful)
- Pull last ~50 log lines from `function_edge_logs` filtered by job id (search the event_message). Show event name + timestamp + key fields. Lets you see `transcription_routing`, `transcription_completed`, `diarization_prompt_skipped` etc. inline.

**7. Job picker** (top right)
- Defaults to "latest job (any user)". Dropdown of last 20 jobs by `created_at desc` so you can flip between recent ones without leaving the tab.

### Data sources
- `jobs` (latest by `created_at desc`) — admin-readable via service-role edge function (current RLS only allows owner select).
- `job_outputs` (joined on `job_id`) — same.
- `function_edge_logs` (analytics) — fetched via a small admin-only edge function.

### Implementation

**New edge function: `admin-get-job-details`**
- Verifies caller has `admin` role (using `has_role`).
- Inputs: optional `job_id`, optional `limit` for picker list.
- Returns: `{ job, outputs[], recent_jobs[], edge_logs[] }`.
- Uses service role to bypass RLS; admin check is enforced first.
- Calls Supabase Analytics API for `function_edge_logs` filtered by job id substring across recent rows.

**New components**
- `src/pages/Admin.tsx` — add second `<TabsTrigger value="logs">Logs</TabsTrigger>` and matching `<TabsContent>`.
- `src/components/admin/LogsTab.tsx` — top-level tab UI with picker + sections.
- `src/components/admin/JobAuditCard.tsx` — header + routing/language audit panel.
- `src/components/admin/JsonBlock.tsx` — small reusable collapsible JSON viewer with copy button (no new deps; use `<pre>` + `JSON.stringify(_, null, 2)` and a simple key-based collapse).
- `src/components/admin/EdgeLogsList.tsx` — list of recent function logs for the job.

**No DB schema changes.** No migrations. No new tables.

### Files to add / edit
- ADD `supabase/functions/admin-get-job-details/index.ts`
- EDIT `src/pages/Admin.tsx` — register Logs tab
- ADD `src/components/admin/LogsTab.tsx`
- ADD `src/components/admin/JobAuditCard.tsx`
- ADD `src/components/admin/JsonBlock.tsx`
- ADD `src/components/admin/EdgeLogsList.tsx`

### Acceptance
- Navigating to `/admin` shows two tabs: "Transcribe settings" and "Logs".
- "Logs" loads the latest job by default, shows header facts, language/routing audit, full AAI request JSON, raw AAI response JSON, list of post-processing outputs, and the last edge logs for that job.
- A picker lets me switch to any of the last 20 jobs.
- Non-admins hitting the edge function get 403; the AdminGuard already prevents UI access.

