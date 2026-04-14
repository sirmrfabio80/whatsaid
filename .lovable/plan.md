

# Output Language UX/Copy Cleanup — Revised Plan

## Verification results

**`summary_language` (DB column)**: Actively written by `post-process`, `regenerate`, and `claim-transcript-share` edge functions. Used as a fallback in `JobResults.tsx` line 76. **Not safe to remove.** Keep as backward-compatibility fallback.

**`summaryLanguage` (i18n key)**: Zero references in any `.ts` or `.tsx` file. Present only in the three JSON locale files. **Dead key — safe to remove.**

**`regeneratingSummary` (i18n key)**: Referenced in exactly one place (`JobResults.tsx` line 562). Can be safely renamed.

## Changes

### 1. i18n keys (en.json, fr.json, it.json)

- **Remove** `summaryLanguage` — confirmed dead, no code references
- **Rename** `regeneratingSummary` → `translatingContent` (same copy, fix legacy key name)
- **Update** `viewingTranslation`:
  - EN: "Translated view — edit in original language"
  - FR: "Vue traduite — modifiez dans la langue d'origine"
  - IT: "Vista tradotta — modifica nella lingua originale"
- **Add** `translatingTranscript`:
  - EN: "Translating…"
  - FR: "Traduction…"
  - IT: "Traduzione…"

### 2. JobResults.tsx

- **Keep** `summary_language` in the select query and `JobMeta` interface — backward compatibility
- **Keep** the fallback chain `m.output_language || m.summary_language || m.language_detected`
- **Update** `t("jobResults.regeneratingSummary")` → `t("jobResults.translatingContent")` on line 562
- **Add transcript tab loading state**: when `regeneratingLang` is true, show a spinner overlay with `t("jobResults.translatingTranscript")` instead of the transcript editor (same pattern as summary tab, lines 536–553)

### 3. No other files change

No schema changes. No edge function changes. No architecture changes.

## Files affected

| File | Change |
|---|---|
| `src/i18n/locales/en.json` | Remove `summaryLanguage`, rename key `regeneratingSummary` → `translatingContent`, update `viewingTranslation`, add `translatingTranscript` |
| `src/i18n/locales/fr.json` | Same |
| `src/i18n/locales/it.json` | Same |
| `src/components/JobResults.tsx` | Update i18n key ref, add transcript loading state |

## What is explicitly preserved

- `summary_language` DB column, query field, interface property, and fallback — all untouched
- All edge function references to `summary_language` — untouched

