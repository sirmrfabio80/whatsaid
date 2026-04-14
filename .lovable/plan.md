

# Revised Plan: Simplified Upload UX + Canonical English Tags

## Part A: Simplified Upload UX with Smart Auto-Defaults

### A1. Phone-call auto-detection heuristic (v1, conservative)

```text
isLikelyPhoneCall = channels === 1 (mono) AND extension is .m4a
```

When matched, auto-set:
- `strategy: "recovery"`
- `enhanceAudio: true`

This is a cautious first-version heuristic. Mono `.m4a` is a strong signal for iPhone Voice Memo but not a guaranteed phone-call detector.

### A2. Convert.tsx — hide settings, show badge, fix scroll

**Hide TranscriptionSettings by default.** Replace the always-visible `<TranscriptionSettings>` with:
- A small info badge when auto-detection fires: "Optimised for phone call recording" (dismissible, with a link to advanced options)
- A subtle collapsible link: "Advanced transcription options" that reveals the full `TranscriptionSettings` component
- When user opens advanced and changes settings, the auto-detected badge disappears

**Auto-apply logic** (in `handleFileSelected` or a `useEffect` watching `file`/`audioChannels`):
```ts
const ext = file?.name.split(".").pop()?.toLowerCase();
const isLikelyPhoneCall = audioChannels === 1 && ext === "m4a";
if (isLikelyPhoneCall) {
  setTranscriptionConfig({ strategy: "recovery", enhanceAudio: true });
  setAutoOptimised(true);
} else {
  setTranscriptionConfig({});
  setAutoOptimised(false);
}
```

**Scroll fix:** Add a `useRef` on the upload card container. In `handleConvert`, call `cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })` instead of `window.scrollTo`. This anchors reliably on both mobile and desktop.

### A3. TranscriptionSettings.tsx — no structural changes

Keep as-is. The parent `Convert.tsx` controls when it's visible via the advanced collapsible.

### A4. Files changed (Part A)

| File | Change |
|------|--------|
| `src/pages/Convert.tsx` | Auto-detect logic, hide settings, add badge, advanced collapsible, scroll fix |
| `src/i18n/locales/en.json` | Strings for badge, advanced link |
| `src/i18n/locales/fr.json` | Same |
| `src/i18n/locales/it.json` | Same |

---

## Part B: Canonical English Tags + UI Translation

### B1. Problem today

The AI prompt in `auto-tag.ts` does not specify output language. If the transcript is in Italian, tags come back in Italian (e.g. "ospedale", "logopedia"). This makes tags inconsistent across languages and breaks reuse.

### B2. Fix: force English in AI prompt

Update the system prompt in `supabase/functions/_shared/auto-tag.ts`:
```
- Tags must ALWAYS be in English, regardless of the transcript language
```

This ensures all generated tags are canonical English. Existing manual user-created tags are unaffected.

### B3. UI translation layer

Create a lightweight tag translation utility that uses the Lovable AI gateway to translate tag names on demand for display:

**Approach:** Client-side translation with caching.

Create `src/lib/tag-translation.ts`:
- `translateTags(tags: string[], targetLang: string): Promise<Map<string, string>>`
- Calls a small edge function `translate-tags` that batch-translates English tag names to the target language
- Results are cached in a `Map` keyed by `lang:tagName` (in-memory, per session)
- When `targetLang === "en"`, return identity mapping (no API call)

Create `supabase/functions/translate-tags/index.ts`:
- Accepts `{ tags: string[], target_lang: string }`
- Uses Lovable AI gateway with a simple prompt: "Translate these English tags to {lang}. Return JSON object mapping English to translated."
- Lightweight, fast, cacheable

**Hook:** Create `src/hooks/use-translated-tags.ts`:
- Takes an array of `Tag[]` and the current UI language from `i18n`
- Returns the same array with a `displayName` field added
- Caches results so repeated renders don't re-fetch

**Rendering changes:**
- `src/components/JobDetailTags.tsx` — show `tag.displayName ?? tag.name` instead of `tag.name`
- `src/pages/History.tsx` — same change for tag chips in job cards
- `src/hooks/use-history-filters.ts` — filter dropdown shows translated names

### B4. Existing tags — no migration needed

Existing non-English tags continue to work. They were created by users or old AI runs. They'll display as-is (the translation layer only translates when it has a mapping). Over time, new AI tags will all be English. Users can manually rename old tags if they want.

### B5. Files changed (Part B)

| File | Change |
|------|--------|
| `supabase/functions/_shared/auto-tag.ts` | Add "always English" rule to AI prompt |
| `supabase/functions/translate-tags/index.ts` | **New** — batch tag translation edge function |
| `src/lib/tag-translation.ts` | **New** — client-side translation cache utility |
| `src/hooks/use-translated-tags.ts` | **New** — hook providing translated tag display names |
| `src/components/JobDetailTags.tsx` | Use translated display names |
| `src/pages/History.tsx` | Use translated display names for tag chips |
| `src/hooks/use-history-filters.ts` | Use translated names in filter dropdown |

---

## Regression Risks

| Risk | Mitigation |
|------|-----------|
| Auto-detection false positive (mono .m4a that's not a phone call) | User can override via advanced options; badge makes auto-detection visible |
| Translation API adds latency to tag display | Cache aggressively; English users see zero latency; non-English users see brief flash then translated names |
| Existing non-English tags look inconsistent alongside new English ones | Acceptable for v1; translation layer will translate them too if they're recognisable English |
| Scroll fix breaks on certain mobile browsers | `scrollIntoView` is well-supported; fallback to `window.scrollTo` if ref is null |

## Test Plan

1. Upload a mono `.m4a` file → verify badge appears, config auto-set to recovery + enhance
2. Upload a stereo `.mp3` → verify no badge, balanced strategy, no enhance
3. Open advanced options → change strategy → verify badge disappears
4. Click Convert → verify card scrolls into view smoothly on mobile and desktop
5. Process a job → verify generated tags are English regardless of transcript language
6. Switch UI language to French → verify tag chips display French translations
7. Switch UI language to English → verify tags display as-is (no translation call)
8. Check History page tag chips and filter dropdown show translated names

