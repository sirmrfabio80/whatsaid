

# Move and Redefine the Language Selector — Plan

## Naming options

| Option | Label | Rationale |
|--------|-------|-----------|
| **A** | **Output language** | Clear, neutral, covers all generated content. Does not imply it changes the source audio language. |
| **B** | **Content language** | Slightly broader — could be confused with the language of the original audio. |
| **C** | **Translation** | Implies the content is being translated, which is accurate but may confuse users who think it changes the original. |

**Recommendation: "Output language"** — it communicates that the control affects what the app produces (transcript, summary, Q&A, exports) without suggesting it changes the source audio.

## Placement

Move the selector into the Transcript tab's top action bar (the `flex` row at lines 397–399 that currently holds `SpeakerChips`). Place it right-aligned after the speaker chips, before the card content. On mobile, it sits in the mobile speaker-chips bar area.

```text
┌─────────────────────────────────────────────────┐
│ [Transcript] [Summary] [Questions]   [Copy][Share][Export] │
├─────────────────────────────────────────────────┤
│ SpeakerChips ...              [🌐 Output language ▾] │
├─────────────────────────────────────────────────┤
│ transcript content                              │
└─────────────────────────────────────────────────┘
```

## What changes

### `src/components/JobResults.tsx`
1. Move the language `Select` + `Globe` icon + `Loader2` spinner from the Summary tab (lines 452–462) into the Transcript tab's top bar (lines 397–399), right-aligned via `ml-auto`.
2. Rename `handleSummaryLanguageChange` → `handleOutputLanguageChange` (internal only, same logic for now).
3. Rename state `summaryLang` → `outputLang` for clarity.
4. Remove the entire `<div className="flex flex-col gap-2 p-3 border-b">` wrapper from the Summary tab — the selector no longer lives there.
5. Update the `aria-label` and `id` from `summary-lang` to `output-lang`.

### `src/i18n/locales/en.json`, `fr.json`, `it.json`
- Add key `jobResults.outputLanguage` with translations:
  - EN: `"Output language"`
  - FR: `"Langue de sortie"`
  - IT: `"Lingua di output"`
- Keep `summaryLanguage` key temporarily (no breaking references elsewhere).

### No other files change
The `regenerate` edge function already accepts `target_language` — no backend change needed. The control's _meaning_ is redefined in the UI; actual multi-output regeneration (translating transcript + Q&A too) is deferred per the guardrails.

## Regression risks

| Risk | Detail |
|------|--------|
| Summary regeneration still works | The handler logic is unchanged — only moved. Low risk. |
| Transcript tab layout shift | Adding a selector to the speaker-chips row. Need to ensure it doesn't crowd chips on narrow screens — use `shrink-0` and `ml-auto`. |
| Stale i18n key references | `summaryLanguage` key left in place; no breakage. Will be cleaned up later. |
| User expectation mismatch | Control now implies it affects transcript/Q&A, but actual translation of those is not yet wired. The spinner + regeneration currently only affects summary. Acceptable per guardrails — this prompt is UI repositioning only. |

## Out of scope (per guardrails)
- Translating transcript or Q&A when language changes
- Persisting translation variants
- Reset-to-original functionality

