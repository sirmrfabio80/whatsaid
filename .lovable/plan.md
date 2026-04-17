

## Plan: Strategy clarity in Admin + Logs (revised)

### Goal
Make the gap between *configured strategy* and *effective prompt behaviour* explicit in both Admin and Logs. No payload behaviour changes.

### 1) `TemplateEditor.tsx` — Admin settings clarity
Under the **Default strategy** dropdown, render a two-line "Effective behaviour" block that updates live based on the current `apply_prompt_on_diarization` value and chosen strategy:

- **Configured strategy:** `Recovery` (or Review / Keyterms / None)
- **Effective prompt behaviour:**
  - If strategy is `recovery` or `review`:
    - toggle ON → "Prompt sent on **multichannel** and **diarization (mono)** jobs."
    - toggle OFF → "Prompt sent on **multichannel** jobs only. **Skipped on diarization (mono)** by template policy — strategy label is still recorded for audit."
  - If strategy is `keyterms` → "No prose prompt sent. `keyterms_prompt` array attached on all routes."
  - If strategy is `none` → "No prompt attached on any route."

Styled as a muted info block (border + bg-muted/30), not an error. Always visible — not conditional — so the relationship is discoverable even when toggle is ON.

### 2) `JobAuditCard.tsx` — Logs clarity
Add a new compact **"Strategy & prompt"** sub-block inside the existing routing/language audit area (above or beside the language pills). Two labelled lines:

- **Configured strategy:** value from `cfg.strategy` (e.g. `recovery`), rendered as a pill.
- **Effective prompt behaviour on this job:** plain-English sentence derived from `cfg.strategy`, `cfg.route` (or `route_hint`), and `cfg.prompt`:
  - `prompt` is non-null → "Prompt sent to AssemblyAI ({N} chars)."
  - `prompt` is null AND strategy ∈ {recovery, review} AND route is diarization → **"Prompt skipped on diarization route by template policy."** (amber-toned border)
  - `prompt` is null AND strategy = `keyterms` → "Prose prompt not used; keyterms array sent instead ({N} terms)." (neutral)
  - `prompt` is null AND strategy = `none` → "No prompt configured." (neutral)
  - `prompt` is null AND strategy ∈ {recovery, review} AND route = multichannel → "Prompt unexpectedly missing on multichannel route — investigate." (destructive)
  - Legacy jobs missing `strategy` field → fall back to "Strategy not recorded for this job."

Tone classes follow the existing `AudioEnhancementAudit` pattern (ok / skipped / failed / legacy → border + bg colour).

### 3) Files to edit
- `src/components/admin/TemplateEditor.tsx` — add live "Effective behaviour" block under Default strategy.
- `src/components/admin/JobAuditCard.tsx` — add `StrategyPromptAudit` component, render it inside `CardContent` near the language audit block.

### Out of scope
- No changes to `supabase/functions/transcribe/index.ts` or any payload logic.
- No new fields written to `transcription_config`.

### Acceptance
- Admin → Transcribe settings: Default strategy section always shows the configured strategy + a plain-English effective behaviour line that updates when the diarization toggle flips.
- Admin → Logs: every job card shows a "Strategy & prompt" block with the configured strategy *and* a plain-English explanation of what actually happened on that job (not just `prompt: null`).
- Current job (strategy=recovery, route=diarization, prompt=null) reads: *"Configured strategy: recovery. Effective prompt behaviour on this job: Prompt skipped on diarization route by template policy."*
- Multichannel job with prompt sent reads: *"Prompt sent to AssemblyAI (842 chars)."*
- Legacy jobs without `strategy` still render without errors.

