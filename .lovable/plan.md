

## Revised plan: Listening preferences (voice + speed)

### 1. Migration — strict & non-nullable

Add to `public.profiles`:
- `preferred_voice text NOT NULL DEFAULT 'female' CHECK (preferred_voice IN ('male','female'))`
- `playback_speed real NOT NULL DEFAULT 1.0 CHECK (playback_speed IN (0.75, 1.0, 1.25, 1.5))`

No RLS changes — verified that existing `profiles` policies allow the user to `SELECT` and `UPDATE` their own row (`auth.uid() = user_id`), and the `profile` query in `Settings.tsx` already does `select("*")` and `update(...)` against `profiles`. New columns ride on those paths automatically.

### 2. Single source of truth for seeding speech preferences

**`src/contexts/AuthContext.tsx`** is the only seeding point:
- Extend the existing `refreshProfile(uid)` query to also select `preferred_voice, playback_speed`.
- After setting local profile state, call `setSpeechPreferences({ voice, rate })` from the speech hook module.
- This effect already runs on user login and on profile refresh — covers session start and any later profile change.

**No changes to `src/components/JobResults.tsx`.** The Listen feature continues to read from the singleton manager only. No duplicate loaders, no Settings-side seeding (Settings only updates the manager for the test action and saves to DB).

### 3. Speech hook — preferences + voice picker (`src/hooks/use-speech-synthesis.ts`)

Add module-level state:
```
let preferences = { voice: 'female' as 'male'|'female', rate: 1.0 as number };
export function setSpeechPreferences(prefs: Partial<typeof preferences>): void
```

**`pickVoice(lang, gender)` selection order** (clear, deterministic):
1. **Exact language match** (e.g. `voice.lang === 'en-US'` when requested).
2. **Same language family / prefix** (`voice.lang.split('-')[0] === lang.split('-')[0]`).
3. Within the candidate set, prefer `voice.localService === true`.
4. Within the remaining candidates, apply gender heuristic regex on `voice.name` (female: `samantha|victoria|karen|fiona|moira|tessa|zira|hazel|amelie|amélie|audrey|virginie|alice|carla|federica|paola|female|woman`, male: `daniel|alex|fred|tom|david|mark|thomas|nicolas|sébastien|sebastien|paul|luca|cosimo|diego|male|man`).
5. **Browser default** (`undefined` → `utt.voice` left unset).

> Comment in code: gender matching is best-effort only — browser voice metadata is inconsistent across OS/Chrome/Safari/Firefox, so heuristic mismatches are expected and we fall back gracefully.

**`voiceschanged` handling — concrete behaviour**:
- Module init: read `window.speechSynthesis.getVoices()` once into `voicesCache`. If empty, register a one-time `voiceschanged` listener that refills `voicesCache` and removes itself.
- `pickVoice` always reads the latest `voicesCache`. If still empty when called → return `undefined` (browser default).
- The Settings **Test voice** button: if `voicesCache` is empty at click time, force a fresh `getVoices()` synchronously, then proceed. No retry timer, no race.

Apply to utterances inside `manager.play(...)`:
- `utt.voice = pickVoice(lang, preferences.voice) ?? null`
- `utt.rate = preferences.rate` (already validated to be one of {0.75, 1.0, 1.25, 1.5}).

### 4. Settings UI — new "Listening" card (`src/pages/Settings.tsx`)

Insert a new `Card` between "Preferences" and the password/security cards.

- Title: `t('settings.listening.title')`
- Helper: `t('settings.listening.desc')` ("Voice availability depends on your browser and device. We pick the closest match.")
- **Voice** — `RadioGroup` with `male` / `female`. Local state seeded from `profile.preferred_voice` (defaults `'female'`).
- **Speed** — `Select` with options `0.75`, `1.0`, `1.25`, `1.5`. Local state seeded from `profile.playback_speed`.
- **Test voice** button (`Volume2` icon):
  1. **Stop any active speech first**: call `speechManager.stop()`.
  2. Push current local selections to manager via `setSpeechPreferences(...)`.
  3. `manager.play('settings-test', t('settings.listening.sample'), i18n.language)`.

**Persistence**:
- Extend the existing `saveChanges()` in `Settings.tsx` (no new save flow). Include `preferred_voice` and `playback_speed` in the existing `profiles.update({...})` call.
- **Validate before save**: define `ALLOWED_VOICES = ['male','female'] as const`, `ALLOWED_SPEEDS = [0.75, 1.0, 1.25, 1.5] as const`. Before the update call, assert both values are in their allowed set; on failure surface a toast and abort. This guards both the UI and the DB CHECK constraints.
- After save success, also call `setSpeechPreferences(...)` so the live JobResults Listen feature picks up the new prefs immediately without page reload.

### 5. i18n — `en.json`, `fr.json`, `it.json`

Under `settings.listening`: `title`, `desc`, `voice`, `voiceMale`, `voiceFemale`, `speed`, `test`, `sample`, `invalidValue` (toast for validation failure).

### Files changed

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Strict NOT NULL + CHECK columns on `profiles` |
| `src/hooks/use-speech-synthesis.ts` | `preferences` state, `setSpeechPreferences`, `pickVoice` (5-step order), `voiceschanged` cache, apply `voice`/`rate` in `play()` |
| `src/contexts/AuthContext.tsx` | Extend `refreshProfile` SELECT + call `setSpeechPreferences` after load (single seeding point) |
| `src/pages/Settings.tsx` | Add Listening card; validate-before-save; extend existing `saveChanges` `profiles.update`; Test button stops first, then plays |
| `src/i18n/locales/{en,fr,it}.json` | New `settings.listening.*` keys |

### Out of scope (unchanged)
- `src/components/JobResults.tsx` (no edits)
- Any other Settings sections, billing, sharing, exports, edge functions, transcript pipeline

