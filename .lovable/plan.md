

# Plan: Inline Transcript Correction on Job Page (Revised)

## Summary

Add segment-level inline editing to the transcript tab on the Job page. Users can correct text and speaker labels one line at a time, with safe line-based parsing that preserves original formatting exactly.

## Current state

Transcript is a single text blob in `job_outputs.content`. Rendered by `renderTranscriptWithBoldSpeakers()` which splits by `\n` and pattern-matches `SpeakerLabel: text`. Users cannot UPDATE `job_outputs` (no RLS policy exists).

## Key constraints (v1)

1. **Line-based parsing only** — each `\n`-delimited line is one segment. No grouping of consecutive same-speaker lines. Reconstruction = `segments.join("\n")` — guaranteed lossless.
2. **No per-segment "Edited" badges** — after a successful save, show a single transcript-level indicator: "Transcript manually updated". No session diffing or first-load snapshot logic.
3. **Speaker edit is segment-scoped** — changing a speaker label on one line changes only that line. No global rename propagation.

## Database change

One migration: UPDATE policy on `job_outputs`.

```sql
CREATE POLICY "Users can update outputs of own jobs"
ON public.job_outputs FOR UPDATE
USING (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()));
```

## New component: `TranscriptEditor.tsx`

**Segment model** (line-based):
```ts
interface Segment {
  index: number;        // line index in the array
  speaker: string | null;
  text: string;         // everything after "Speaker: "
  raw: string;          // original line preserved for non-speaker lines
}
```

**Parsing**: `content.split("\n")` → for each line, try `match(/^(.+?):\s(.*)/)`. If matched: `{ speaker, text }`. Otherwise: `{ speaker: null, text: line, raw: line }`.

**Reconstruction**: For speaker lines: `${speaker}: ${text}`. For non-speaker lines: `raw` (or `text` if edited). Join with `"\n"`.

**Behaviour**:
- Default: read-only, identical to current view
- "Edit transcript" button toggles correction mode
- In correction mode: each line gets a subtle pencil icon on hover/tap
- Tapping a line opens inline editing: `<Textarea>` for text, `<Select>` for speaker (populated from existing speakers in this transcript only)
- Only one line editable at a time
- Switching away from unsaved edits shows lightweight confirm
- Save reconstructs full text, calls `onSave(newContent)`
- After successful save: transcript-level banner "Transcript manually updated" (dismissible)
- Cancel reverts that line

**Speaker dropdown**: Lists all unique speakers found in the current transcript. Changing speaker on a segment only affects that one line.

**Mobile**: Textarea fills width, Save/Cancel stack, all targets ≥ 44px. Sticky "Done editing" at top of card.

**"Report transcription issue"**: Ghost button below transcript, opens a toast placeholder for now.

## Changes to `JobResults.tsx`

- Replace `renderTranscriptWithBoldSpeakers()` with `<TranscriptEditor>` in transcript tab
- Add `handleTranscriptSave`: updates `job_outputs.content` via supabase, refreshes local state
- Pass `onSave` callback to `TranscriptEditor`
- After save success, set a `transcriptEdited` boolean to show the banner

## Translation keys

Add to en/fr/it:
- `jobResults.editTranscript` / `jobResults.doneEditing`
- `jobResults.saveSegment` / `jobResults.cancelEdit`
- `jobResults.unsavedChanges`
- `jobResults.transcriptUpdated` (banner text)
- `jobResults.reportIssue`
- `jobResults.changeSpeaker`

## Files changed

| File | Change |
|---|---|
| `src/components/TranscriptEditor.tsx` | New — line-based parsing, inline editing, speaker select |
| `src/components/JobResults.tsx` | Use TranscriptEditor, add save handler, edited banner |
| `src/i18n/locales/en.json` | New keys |
| `src/i18n/locales/fr.json` | New keys |
| `src/i18n/locales/it.json` | New keys |
| Migration | UPDATE RLS policy on job_outputs |

## Not modified

- `JobDetail.tsx`, `SpeakerChips.tsx`, export/copy logic, summary, questions, auth, pricing — untouched
- `handle_new_user()` — untouched
- No new tables or edge functions

