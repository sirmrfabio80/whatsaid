

# AI-Assisted Speaker Reassignment — Revised Plan

## A. Current Segment Representation

Transcript segments have **no stable IDs today**. The `Segment` interface in `TranscriptEditor.tsx` uses a positional `index` (line number) that changes whenever lines are added, removed, or reordered. The `parseSegments()` function splits content by `\n` and assigns sequential indices.

**Required groundwork**: Generate a stable UUID for each segment at parse time. These IDs live only in React state and are never persisted to the database — the DB continues to store plain text. IDs are regenerated deterministically from content on each parse, or (simpler and safer) generated fresh with `crypto.randomUUID()` each time content is parsed into segments. Since suggestions are ephemeral and consumed in the same session, fresh UUIDs are fine.

## B. Revised UX Flow

1. User adds a new speaker via `+ Speaker` chip (existing)
2. On the newly created speaker chip, a small secondary action appears: **"Suggest segments"** (sparkle icon) — only on speakers that have zero assigned segments
3. Clicking it sends the transcript + target speaker name to the `suggest-speakers` edge function
4. Loading state appears as a subtle shimmer on the transcript area (~2-4s)
5. AI returns a list of `{ segmentId, confidence }` pairs — only segments it thinks belong to the **new speaker**
6. Transcript enters **preview mode**:
   - Suggested segments get a tinted left border + small badge showing the new speaker name
   - Segments the user has manually edited are excluded and never highlighted
   - A floating bar appears: **"Accept all (N)" / "Dismiss"**
7. User can click individual segment badges to reject them before accepting
8. "Accept all" saves reassigned segments via the existing `onSave` path
9. Preview state is cleared after accept or dismiss

**UI trigger rationale**: The "Suggest segments" action only appears on speaker chips with zero segments assigned. This avoids clutter — existing speakers with content don't show it. It disappears once the speaker has segments. One action, scoped to the relevant speaker.

## C. Data Contract

```typescript
// Segment with stable ID (frontend only)
interface Segment {
  id: string;        // crypto.randomUUID(), ephemeral
  index: number;     // positional, for rendering order
  speaker: string | null;
  text: string;
  raw: string;
}

// Edge function request
interface SuggestSpeakersRequest {
  transcript_lines: Array<{
    id: string;
    speaker: string | null;
    text: string;
  }>;
  target_speaker: string;        // the new speaker to assign
  existing_speakers: string[];   // all current speaker labels
  excluded_ids: string[];        // manually edited segment IDs
}

// Edge function response
interface SuggestSpeakersResponse {
  suggestions: Array<{
    id: string;          // segment ID from request
    confidence: number;  // 0.0–1.0
  }>;
}
```

All suggestions reference segment IDs from the request. The frontend maps them back to its local segment state. No line indices cross the wire.

## D. Long-Transcript Cost Strategy

**Proven pattern**: `auto-tag.ts` already truncates transcripts to 12,000 chars. This function will follow the same approach.

- **Transcripts ≤ 15,000 chars** (~25 min of speech): send full transcript. Single AI call.
- **Transcripts > 15,000 chars**: send the first 2,000 chars + last 2,000 chars as context anchors, plus the full list of segment IDs/speakers/first-50-chars-of-text. The AI sees enough conversational pattern to suggest reassignments without receiving every word.
- **Model**: `google/gemini-2.5-flash-lite` (same as auto-tag — cheapest, fast, sufficient for pattern matching).
- **Single call per user action**. No streaming, no retries, no polling.
- Suggestions below 0.5 confidence are filtered server-side and never sent to the client.

## E. Backend Approach — No Tool-Calling

The codebase uses plain JSON response parsing everywhere (`auto-tag.ts` pattern):
- System prompt instructs: "Return ONLY a JSON array"
- Response text is stripped of markdown fences, then `JSON.parse`
- Validated and cleaned with a typed function

The `suggest-speakers` function will follow this exact pattern. No tool-calling, no `response_format`.

## F. Manual Edit Exclusion

- `TranscriptEditor` will track a `Set<string>` of manually edited segment IDs (segments saved via `saveSegment`)
- This set is passed up to `JobResults` and forwarded to the edge function as `excluded_ids`
- The AI never sees excluded segments in its input
- If a user manually edits a segment during preview mode, that segment's suggestion is silently removed

## G. Files to Change

| File | Change |
|------|--------|
| `supabase/functions/suggest-speakers/index.ts` | **New** — edge function, JSON-parse approach |
| `src/components/TranscriptEditor.tsx` | Add `id` to Segment interface, generate UUIDs at parse, track edited IDs, render suggestion preview highlights, accept/reject UI |
| `src/components/SpeakerChips.tsx` | Add "Suggest segments" action on zero-segment speaker chips |
| `src/components/JobResults.tsx` | Add suggestion state, handler for `suggest-speakers` invoke, pass props down |
| `src/i18n/locales/en.json` | New strings |
| `src/i18n/locales/fr.json` | New strings |
| `src/i18n/locales/it.json` | New strings |

## H. Implementation Order

1. Add `id: string` to `Segment` interface and generate UUIDs in `parseSegments()`
2. Track manually edited segment IDs in `TranscriptEditor`
3. Create `suggest-speakers` edge function
4. Add suggestion state + handler in `JobResults.tsx`
5. Add "Suggest segments" trigger to `SpeakerChips.tsx` (only on zero-segment speakers)
6. Add suggestion preview rendering + accept/dismiss bar in `TranscriptEditor.tsx`
7. Add i18n strings

## I. Regression Risks

- **Low**: Segment ID is additive — `reconstructContent()` ignores IDs, so DB persistence is unchanged. Export, share, copy all read from `segments` state or raw content string.
- **Medium**: TranscriptEditor's editing state (active segment, dirty flag, confirm dialogs) must dismiss suggestions when entering manual edit mode. Mitigation: entering edit mode on a segment clears its suggestion; accepting suggestions exits edit mode first.
- **None for existing features**: No DB schema changes, no new tables, no changes to export/share/summary/tags.

