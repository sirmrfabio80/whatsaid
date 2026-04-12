

## i18n Implementation Plan

### Approach
Use **react-i18next** + **i18next** — the standard React i18n library. It integrates cleanly with React + TypeScript, supports namespace-based translation files, and has excellent tooling.

### New files to create

**1. Translation files** (JSON, one per language):
- `src/i18n/locales/en.json` — all English strings extracted from components
- `src/i18n/locales/it.json` — complete Italian translations
- `src/i18n/locales/fr.json` — complete French translations

**2. i18n configuration**:
- `src/i18n/index.ts` — initializes i18next with browser language detection, fallback to `en`

**3. Language switcher component**:
- `src/components/LanguageSwitcher.tsx` — small dropdown in the Navbar for switching UI language (distinct from the audio language selector)

### Dependencies to install
- `i18next`
- `react-i18next`
- `i18next-browser-languagedetector`

### Translation key structure
Organized by page/component namespace for maintainability:

```json
{
  "common": { "signIn": "Sign in", "signOut": "Sign out", ... },
  "nav": { "convert": "Convert", "pricing": "Pricing", "profile": "Profile", ... },
  "home": { "heroTagline": "AI transcription + speaker labels", ... },
  "convert": { "title": "Convert your audio", ... },
  "login": { ... },
  "settings": { ... },
  "profile": { ... },
  "history": { ... },
  "credits": { ... },
  "jobDetail": { ... },
  "jobResults": { ... },
  "audioUploader": { ... },
  "export": { ... },
  "privacy": { ... },
  "terms": { ... },
  "notFound": { ... },
  "resetPassword": { ... }
}
```

### Files to modify

Every component/page with hardcoded strings will be updated to use `useTranslation()` hook and `t()` calls:

| File | Scope |
|------|-------|
| `src/App.tsx` | Wrap with I18nextProvider |
| `src/main.tsx` | Import i18n init |
| `src/components/Navbar.tsx` | Nav labels, menu items |
| `src/components/AudioUploader.tsx` | Upload prompts, errors |
| `src/components/ExportButton.tsx` | Format labels, toasts |
| `src/components/JobResults.tsx` | Tab labels, prompts, disclaimers |
| `src/components/SpeakerChips.tsx` | "Speakers:", "Reset names", suggestions label |
| `src/components/LanguageSelector.tsx` | "Language" label |
| `src/pages/Index.tsx` | All hero, features, footer text |
| `src/pages/Convert.tsx` | Step labels, prompts, consent text |
| `src/pages/Login.tsx` | Form labels, buttons, descriptions |
| `src/pages/ResetPassword.tsx` | All form text |
| `src/pages/Profile.tsx` | Stats labels, actions |
| `src/pages/Settings.tsx` | Section headings, form labels, dialogs |
| `src/pages/History.tsx` | Page title, empty state, delete dialog |
| `src/pages/Credits.tsx` | Page title, pack features, pricing text |
| `src/pages/JobDetail.tsx` | Back/new buttons, generating title text |
| `src/pages/Privacy.tsx` | All legal text (full IT/FR translations) |
| `src/pages/Terms.tsx` | All legal text (full IT/FR translations) |
| `src/pages/NotFound.tsx` | 404 text |

### Language switcher placement
A compact globe dropdown added to the Navbar (both desktop and mobile), showing EN / IT / FR flags or labels. Changes the UI language immediately via `i18n.changeLanguage()`. The selected language is persisted in localStorage by the browser language detector plugin.

### Important distinctions
- **UI language** (this feature) — controls all interface text
- **Audio language** (existing `LanguageSelector`) — controls transcription language detection; unchanged
- **Summary language** (existing selector in JobResults) — controls AI summary output language; unchanged

### What stays untouched
- No UI structure or styling changes
- No business logic changes
- No backend/database changes
- Export content (transcript, summary, Q&A) remains in its original language — only UI chrome is translated
- The `LANGUAGES` list in `src/lib/languages.ts` stays as-is (these are transcription languages, not UI languages)

### Estimated string count
~300-350 unique strings across all pages and components, including the full Privacy Policy and Terms of Service (which will have complete Italian and French translations).

