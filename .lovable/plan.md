

## Revised plan: "Listen" control on JobDetail tabs

### Files to add

**1. `src/hooks/use-speech-synthesis.ts`** — module-level singleton playback manager
- A single module-scoped `manager` object holds: `currentOwner`, `currentUtterances[]`, `state`, and a `Set<Listener>` of subscribers.
- The hook (`useSpeechSynthesis()`) subscribes to the manager and returns:
  - `isSupported: boolean`
  - `state: 'idle' | 'playing' | 'paused'`
  - `activeOwner: string | null`
  - `isActiveOwner(ownerId): boolean`
  - `play(ownerId, text, lang?)`
  - `pause()`, `resume()`, `stop()`
- **Lifecycle safety**: the hook does **not** call `cancel()` on unmount. Only the `JobResults` page-level unmount effect (and explicit user actions / tab change) call `manager.stop()`. Individual `ListenButton` unmounts simply unsubscribe their listener — they never touch playback. This guarantees a button rerender or conditional remount cannot kill an active session.
- Mobile/Chrome safety: keep a heartbeat (`pause/resume` workaround for Chrome's 15s cutoff) running only while `state === 'playing'`.

**2. `src/lib/speech-text.ts`** — pure text extractors
- `transcriptToSpeech(content, speakerNames)` — uses `parseSegments`, joins `"<Speaker>: <text>"` per segment, double-newline between turns (longer pause).
- `summaryToSpeech(content)` — strips markdown (`#`, `*`, `_`, `` ` ``, list markers, `[txt](url)` → `txt`), preserves paragraph breaks.
- `latestAnswerToSpeech(answer)` — strips markdown from the single newest visible answer string.
- `chunkForSpeech(text)` — **revised chunking**:
  1. Split on blank lines → paragraphs.
  2. If a paragraph ≤ 600 chars, keep it whole (one utterance).
  3. Otherwise split on sentence boundaries (`. ! ?` followed by space/newline) and greedily pack sentences into ≤ 600-char utterances.
  4. Only if a single sentence exceeds 600 chars, fall back to splitting on commas/clauses with a 400-char floor.
  - Result: natural prosody, far fewer audible seams than fixed 200-char chunks.

### Files to modify

**3. `src/components/JobResults.tsx`**

- Import the hook, helpers, and `Play`, `Pause`, `Square` icons from `lucide-react`.
- Add a small inline `<ListenButton ownerId getText lang label />` component:
  - Always rendered (never hidden) so layout is stable.
  - **Unsupported browsers** → rendered `disabled` with `title` / `aria-label` "Listening isn't available in this browser" and a one-shot `toast.info(...)` only if the user clicks it (click handler short-circuits when `!isSupported`). No contradiction: control is visible + disabled, message is subtle and only on attempt.
  - **Empty content** → `disabled` with `aria-label="Nothing to listen to yet"`.
  - **Stable layout**: the component always reserves space for `[main button] [stop button]`. The Stop button uses `visibility: hidden` (not `display: none`) when `!isActiveOwner(ownerId)`, so the row never jumps when playback starts.
  - Main button states (icon + label):
    - idle → `Play` + `t('jobResults.listen.play')`
    - active+playing → `Pause` + `t('jobResults.listen.pause')`
    - active+paused → `Play` + `t('jobResults.listen.resume')`
  - Stop button: icon-only `Square`, with `aria-label={t('jobResults.listen.stop')}` and `title` tooltip for sighted users.
  - Sizing: `Button variant="ghost" size="sm"` with `rounded-full text-xs h-9 min-w-[44px] min-h-[44px] sm:h-8 sm:min-h-0` to meet the 44px mobile touch target without bloating desktop.

- **Placement (intentional & premium)**:
  - **Transcript tab** → single Listen control in the existing top toolbar (`flex items-center gap-2 p-3 border-b`), placed at the leading edge before language `Globe`/`Select`. Owner id `"transcript"`.
  - **Summary tab** → single Listen control in a thin right-aligned action row at the very top of the summary `CardContent`, above `ParticipantsPanel`. Owner id `"summary"`.
  - **Questions tab** → **one** top-level Listen control in the tab's header/actions row. It plays **only the newest visible answer** in the tab (the most recent saved Q&A entry's answer text), read top-to-bottom. No per-entry Listen buttons. Owner id `"questions"`. If there is no answer yet → disabled.

- **Tab change handling**: wrap `<Tabs onValueChange>` to call `manager.stop()` on every change so playback never bleeds across tabs.

- **Page-level cleanup**: a single `useEffect(() => () => manager.stop(), [])` at the top of `JobResults` ensures playback ends when the user leaves the job detail view. No other cleanup paths touch the manager.

- **Language hint**: pass `meta?.language_detected ?? outputLang` as `utterance.lang`.

**4. `src/i18n/locales/en.json`, `fr.json`, `it.json`** — under `jobResults.listen`:
- `play`, `pause`, `resume`, `stop`
- `unsupported` ("Listening isn't available in this browser.")
- `empty` ("Nothing to listen to yet.")
- `ariaStop` ("Stop listening")

### Acceptance mapping
- Play / Pause / Resume / Stop → hook exposes all four; UI swaps icon + label per state.
- One playback at a time → module-level singleton manager.
- Switching tab stops playback → `Tabs onValueChange` → `stop()`.
- Empty content disables control → `disabled` with aria-label.
- Unsupported browser → control visible + disabled + one-shot toast on click. No contradiction.
- Questions tab → exactly one Listen control reading only the newest visible answer.
- No layout jump → Stop button uses `visibility: hidden` reservation.
- Aria → explicit `aria-label` on the icon-only Stop and on disabled states.
- Singleton lifecycle safety → only page unmount + explicit stop + tab change cancel playback; ListenButton unmounts only unsubscribe.
- Chunking → paragraph-first, sentence-second, ≤600 char target — natural prosody.

### Out of scope (unchanged)
- `supabase/`, edge functions, DB schema
- Export / Share / Copy logic
- Speaker identification, translation, regeneration flows
- `JobDetail.tsx` header (status chip, metadata)
- Any other page

