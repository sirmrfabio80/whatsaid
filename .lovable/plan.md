

# AI Speaker Name Identification — Final Plan

## Key Refinements Applied

1. **No capital-letter requirement** — capitalisation is a positive confidence signal (+0.05) but not a filter. Stopwords and token-shape heuristics prevent false positives instead.
2. **Banner lifecycle** — `job_outputs` stores a `banner_dismissed` flag. Banner shows only when `banner_dismissed` is false and there are `applied` suggestions. Once dismissed, persisted — no resurfacing on reload.

## Pipeline

```text
Job loads → fetch job_outputs for speaker_identifications
  → exists → restore state, show banner only if not dismissed
  → not exists →
      1. Deterministic regex extraction (edge function)
      2. If ambiguous → AI disambiguation (same edge function)
      3. High conf (≥0.85) → auto-apply + show confirmation banner with undo
      4. Medium conf (0.5–0.84) → show suggestion chips
      5. Persist to job_outputs
```

## 1. Deterministic Extraction (in `identify-speakers` edge function)

All patterns use **case-insensitive** matching. Names validated by:
- At least 2 characters
- Not in a stopword list (Italian: "qui", "bene", "pronto", "presente"; English: "here", "fine", "ready", "good"; French: "bien", "sûr", etc.)
- Capitalisation adds **+0.05** confidence but is **not required**

**Italian** (case-insensitive): `mi chiamo X`, `io sono X` (+ stopword filter), `sono il/la dottoressa/terapista/infermiere X`

**English** (case-insensitive): `my name is X`, `I am X` (+ stopword filter), `this is X` (start of utterance), `X speaking` (end of utterance)

**French** (case-insensitive): `je m'appelle X`, `je suis X` (+ stopword filter)

Scoring: single consistent name → 0.90 base (+0.05 if capitalised). Multiple mentions → up to 0.95. Conflicts → 0.5 max.

## 2. AI Disambiguation (same edge function)

Called only for: conflicting names, same name claimed by multiple speakers, or role+name cleanup. Uses `google/gemini-2.5-flash-lite`.

## 3. Execution Guard

In `JobResults.tsx` on load:
1. Fetch `job_outputs` where `output_type = 'speaker_identifications'`
2. If exists → restore from `metadata.suggestions`, respect `metadata.banner_dismissed`
3. If not exists → call edge function, which persists results
4. Skip speakers already manually renamed

"Re-identify" button calls edge function with `force: true`.

## 4. Banner Lifecycle

**`SpeakerIdentificationBanner.tsx`** shows when `applied` suggestions exist and `banner_dismissed` is false.
- Per speaker: "Speaker D → Camilla" with evidence + **Undo** / **Edit** / **Dismiss**
- **Dismiss** sets `metadata.banner_dismissed = true` in `job_outputs` — persisted, never resurfaces
- Medium-confidence suggestions appear as "AI: Name" badges on `SpeakerChips` with accept/reject

## 5. Persistence

| Store | Content |
|-------|---------|
| `jobs.speaker_names` | Effective display names (final authority) |
| `job_outputs` (type `speaker_identifications`) | `metadata.suggestions[]` + `metadata.banner_dismissed` + `metadata.processed_at` |

Accept/reject/undo/dismiss all update `job_outputs` via client (RLS allows owner updates). Applied names also update `jobs.speaker_names`.

## 6. Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/identify-speakers/index.ts` | **New** — deterministic extraction + AI disambiguation + persist via service role |
| `src/components/SpeakerIdentificationBanner.tsx` | **New** — visible confirmation/suggestion banner |
| `src/lib/speaker-identification.ts` | **New** — shared types, stopword list |
| `src/components/JobResults.tsx` | Orchestration: guard, fetch, call edge fn, manage state |
| `src/components/SpeakerChips.tsx` | AI suggestion badge for `suggested` status |
| `src/i18n/locales/en.json`, `fr.json`, `it.json` | New speaker identification UI keys |

No database migration needed.

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| False positives from lowercased words | Stopword list + min 2 chars + token shape |
| Banner resurfacing | `banner_dismissed` persisted in job_outputs |
| Manual renames overridden | Skip speakers already in speakerNames |
| Existing suggest-speakers flow broken | Separate code path |

## 8. Test Plan

1. "io sono camilla" (lowercase) → auto-rename, banner with undo
2. "sono la dottoressa montaldo" → auto-rename with role
3. "Camilla said hello" (third-party) → no rename
4. Same name from two speakers → conflict, suggestions only
5. Dismiss banner → reload → banner stays hidden
6. Undo → reverts to generic label
7. Manual rename → AI skips that speaker
8. Re-identify → re-runs extraction

