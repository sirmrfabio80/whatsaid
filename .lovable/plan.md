

# Revised Plan: JobResults Workspace Redesign

## Overview
Transform the results view into an active review workspace with three tabs, speaker renaming, summary language control, a "Create family update" action, and a saved Q&A workspace. No share button. Strengthened AI disclaimer.

---

## Phase 1: Tab Restructure + Speaker Renaming

### Database
- Add `speaker_names jsonb DEFAULT '{}'` column to `jobs` table via migration
- Add RLS UPDATE policy on `jobs` for authenticated users to update their own `speaker_names`

### JobResults component — full rewrite
- **Three fixed tabs**: Transcript, Summary, Questions
- Remove the old "AI Output" tab — existing `custom` outputs display as the first Q&A entry (Phase 3)
- Remove the "Regenerate AI output" card entirely
- Remove duplicate language badge (keep only in JobDetail metadata bar)
- Move per-tab actions (Copy, Export) into each tab's card header — no Share button

### Speaker renaming (Transcript tab)
- Parse unique speaker labels from transcript content (regex for `Speaker A:`, `Speaker B:` etc.)
- Render editable chips above the transcript, one per detected speaker
- Default suggestions: role-first labels — offer "Doctor", "Nurse", "Me", "Mum", "Receptionist" as quick-pick options in a small dropdown when editing
- Users can type any custom name (role or real name)
- No "+" button for adding speakers — only rename detected ones
- Renaming is client-side replacement in rendered text + persisted to `jobs.speaker_names` via Supabase update
- Renamed labels apply across all tabs (Summary, Questions) when rendering content
- **Accessibility**: chips are `<button>` with `aria-label="Rename Speaker A"`, edit mode uses `<input>` with visible focus ring, minimum 44px touch target, focus returns to chip after save

### Strengthened AI disclaimer
Replace the current single-line disclaimer with a more prominent notice:

> **AI-generated content** — This transcript, summary, and any AI outputs may contain errors including misidentified speakers, inaccurate medical or technical terms, and omitted or fabricated details. Do not rely on this as a verbatim record for medical, legal, or financial decisions. Always verify critical information with the original source.

Render in a subtle card/alert style with an icon, visible below all tab content. Use `role="note"` for screen readers.

---

## Phase 2: Summary Language + Improved Summary

### Summary language selector
- Add a `Select` dropdown on the Summary tab action bar: "Summary language"
- Default value: the transcript's detected language (`meta.language_detected`)
- Changing triggers a call to the `regenerate` edge function with a system prompt that specifies the target language
- Changing summary language does NOT affect the transcript or its language
- Show inline loading state while regenerating

### Edge function update (`regenerate`)
- Accept optional `target_language` parameter
- When provided with `output_type: "summary"`, use a language-specific system prompt: "Produce the summary in [language]"
- When regenerating a summary, delete only the existing summary output (not custom/question outputs)

### "Create family update" button (inside Summary tab)
- A single button below the summary content: "Create family update"
- When clicked, calls the `regenerate` edge function with a pre-built prompt:
  > "Rewrite this summary as a clear, caring update that can be shared with family members. Use simple language, avoid jargon and medical/technical abbreviations, explain any specialist terms in plain words, and focus on what happened, what it means, and what happens next."
- The result is displayed inline below the button in a collapsible card — not a new tab
- Stored as `output_type: "family_update"` in `job_outputs`
- If one already exists, show it immediately and offer "Regenerate"
- **Accessibility**: button has clear label, result card is `aria-live="polite"`

---

## Phase 3: Questions Tab with Saved Q&A

### UI — saved Q&A workspace (NOT chat bubbles)
Structure:
```text
┌──────────────────────────────────────┐
│ [Ask a question about this transcript]│
│                            [Ask →]   │
├──────────────────────────────────────┤
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Q: What medication was mentioned?│ │
│ │──────────────────────────────────│ │
│ │ A: The doctor mentioned...       │ │
│ │                          [Copy]  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Q: What are the next steps?     │ │
│ │──────────────────────────────────│ │
│ │ A: 1. Schedule follow-up...     │ │
│ │                          [Copy]  │ │
│ └──────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

- Question input at the top (textarea + submit button)
- Below: list of saved Q&A cards, most recent first
- Each card shows the question (bold/muted) and the answer in a clean card layout
- Each card has a Copy button
- No chat bubbles, no avatars, no message alignment tricks
- Existing `output_type: "custom"` from initial conversion displayed as the first Q&A card with its original prompt

### Backend
- Store each Q&A as `job_outputs` row with `output_type: "question"` and `custom_prompt` holding the question
- Use the existing `regenerate` edge function with minor adaptation to support `output_type: "question"` (insert instead of delete-then-insert)
- **Accessibility**: Q&A list uses `role="log"` with `aria-live="polite"` on the container, focus moves to the new answer card after generation, textarea has proper `<label>`

---

## Phase 4: Export Inclusion Logic

### Update export functions
- `ExportPayload` interface: add `familyUpdate`, `questions` (array of `{prompt, answer}`)
- DOCX and PDF builders: add "Family Update" section and "Questions & Answers" section
- JSON export: include all output types
- Per-tab Copy: copies only that tab's content
- Per-tab TXT export: exports only that tab's content

---

## Files to create or modify

| File | Change |
|------|--------|
| `src/components/JobResults.tsx` | Full rewrite: 3 tabs, speaker chips, disclaimer, family update, Q&A workspace |
| `src/components/SpeakerChips.tsx` | New: editable speaker rename chips component |
| `src/components/QuestionsTab.tsx` | New: saved Q&A workspace component |
| `src/pages/JobDetail.tsx` | Minor: remove duplicate language badge if still present |
| `src/lib/export.ts` | Update: include family update and Q&A in exports |
| `supabase/functions/regenerate/index.ts` | Update: support `target_language`, `output_type` param, non-destructive question inserts |
| Migration | Add `speaker_names jsonb` to `jobs`, add UPDATE RLS policy |

---

## What is NOT included
- No Share button or coming-soon placeholder
- No "+" button for adding speakers
- No chat-style bubbles in Questions tab
- No new pages or routes
- No changes to the Convert page upload flow

