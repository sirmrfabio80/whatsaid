
## Plan — Listen cleanup + tab header refactor + speech language fix

### 1. Remove the Stop button (`src/components/JobResults.tsx`)
- Inside `ListenButton`: delete the second `<Button>` (Stop) and the `handleStop` function. Pause is enough — same button toggles play/pause/resume.
- Remove `Square` from the lucide-react import. Keep `speechManager.stop()` calls used elsewhere (tab change cleanup, page unmount) — those are involuntary stops, not user actions.
- Remove now-unused i18n key `jobResults.listen.ariaStop` from `en.json`, `fr.json`, `it.json`.

### 2. Fix Listen language mismatch on translated transcripts (`src/components/JobResults.tsx`)
**Bug:** Italian transcript translated to English → speech still uses Italian voice reading English words.
**Cause:** `speechLang = meta?.language_detected ?? outputLang` always wins with the original language.
**Fix:** When viewing a translation variant, the *displayed* text is in `outputLang`, so speech must use `outputLang`. New logic:
```
const speechLang = isViewingTranslation ? outputLang : (meta?.language_detected ?? outputLang);
```
This matches the actual text being spoken in all three tabs (Summary, Transcript, latest Question answer all read variant content when a translation is active).

### 3. Transcript tab — 2-row header (`src/components/JobResults.tsx` + `src/components/SpeakerChips.tsx`)

**Add a `variant` prop to `SpeakerChips`** so the same component renders one of two row types:
- `variant="primary"` → label + chips + "+ Speaker" (no reset, no identify)
- `variant="secondary"` → only Reset names + Identify speakers (rendered as small ghost links)
- Default (no prop) keeps current behaviour for the mobile path (everything stacked in one chunk).

**Desktop (`sm:flex` block, replaces lines 684-700):**
```
Row 1 (flex items-center gap-3 px-3 pt-2.5 pb-1):
  ├─ SpeakerChips variant="primary" (flex-1 min-w-0, wraps)
  └─ ml-auto shrink-0 cluster: ListenButton + Globe + Select
Row 2 (px-3 pb-2.5, only if reset/identify visible):
  └─ SpeakerChips variant="secondary"
border-b border-border/40 on the wrapping container
```
Padding goes from `p-3` to `pt-2.5 pb-2.5` overall — tighter, no wasted vertical band when chips wrap.

**Mobile path (lines 701-719):** Keep stacked layout but apply same 2-row logic for visual consistency: chips row, then a thin row with Listen + Language right-aligned, then the secondary actions. Reduce `mt-2` gap.

### 4. Summary tab — tighten header (`src/components/JobResults.tsx` ~lines 783-789, 842)
- Listen header row: keep `flex justify-end` but reduce to `pt-2 pb-1.5` (was `pt-3 pb-2`).
- Participants section top padding: `pt-5 sm:pt-6` → `pt-3 sm:pt-4` so the empty band above Participants disappears.
- Result: Listen sits ~12px above Participants instead of ~32px.

### 5. Questions tab — match Summary spacing (`src/components/JobResults.tsx` ~lines 864-869)
- Same `pt-2 pb-1.5` on the Listen header row.
- The question input below already has `p-4 sm:p-5`, leave untouched.

### 6. i18n cleanup
- Remove `jobResults.listen.ariaStop` from `src/i18n/locales/{en,fr,it}.json`.
- No other strings change.

### What is NOT changed
- Speech engine, chunking, voice picking — untouched.
- Backend / edge functions — untouched.
- TranscriptEditor (Edit transcript + Search transcript row) — already correctly the third "operational tools" row, no edit needed.
- Tab content bodies — untouched.

### Files touched
1. `src/components/JobResults.tsx` — remove Stop, fix `speechLang`, restructure Transcript header into 2 rows, tighten Summary + Questions header padding.
2. `src/components/SpeakerChips.tsx` — add `variant?: "primary" | "secondary"` prop; render only the matching subset of controls.
3. `src/i18n/locales/en.json` / `fr.json` / `it.json` — remove `jobResults.listen.ariaStop`.

### Validation
- Listen on a Summary tab → only Play/Pause toggles, no Stop.
- Open Transcript tab → Listen + Language sit together top-right; chips + "+Speaker" on the left; Reset + Identify on a secondary row below; no large empty bands.
- Open an Italian transcript, switch language to English → press Listen on Summary or Transcript → English voice speaks English text.
- Open a non-translated transcript → Listen still uses detected language voice (no regression).
- Mobile (narrow viewport) → all three tabs show Listen in the same conceptual top-right slot, controls don't overflow.
