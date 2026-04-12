

## Plan: Three urgent fixes

### 1. Remove language toggle from Navbar

Remove `LanguageSwitcher` import and usage from `src/components/Navbar.tsx` — both the desktop section (line with `<LanguageSwitcher />` between the divider and auth buttons) and the mobile menu section. Language selection stays only in Settings.

**Also fix Settings page**: The current Settings "Preferences" section uses `LanguageSelector` (the audio/transcription language selector). Replace it with a proper UI language selector (EN/IT/FR radio or select) that calls `i18n.changeLanguage()` and persists to `profiles.ui_language`.

Files: `Navbar.tsx`, `Settings.tsx`

### 2. Fix job page layout — move Export into tab action rows

**Remove** the standalone export row (line 113: `<div className="flex justify-end"><ExportButton ... /></div>`) from `JobResults.tsx`.

**Add ExportButton** into each tab's action bar:
- **Transcript tab**: Add `ExportButton` next to the Copy button in the existing `border-b` header row (line 126-131)
- **Summary tab**: Add `ExportButton` next to the Copy button in the existing header row (line 144-158)
- **Questions tab**: Add `ExportButton` next to the "Copy All" button in the existing Q&A count row (line 184-189). When no questions exist yet, show a minimal action row with just the ExportButton.

This uses a consistent pattern: each tab has a top action bar with Export + Copy aligned right, same spacing and button sizes.

Files: `JobResults.tsx`

### 3. Fix the recording date bug — deterministic source, no UTC shifting

**Root cause analysis from DB**: The stored `recorded_at` is `2026-04-12T10:34:24+00:00` with source `file_creation_date`. The actual Apple metadata should be `2026-03-13T10:49:00+01:00`. This means either:
- The Apple metadata extraction returned null for the real file (parser couldn't find the atom), so it fell back to `file.lastModified`
- Or the extraction returned a Date but it was the wrong value

**Fix approach — store the raw ISO string, not a Date object:**

a) **`audio-creation-date.ts`**: Change `extractAudioCreationDate` to return `{ isoString: string; source: string } | null` instead of `Date | null`. When the Apple creationdate is found, return the raw ISO string directly — do NOT parse through `new Date()`. For mvhd, construct the ISO string explicitly from the UTC seconds. This prevents any timezone shifting.

b) **`Convert.tsx`**: Use the raw ISO string directly when inserting `recorded_at`. No `toISOString()` conversion. Fallback to `new Date(file.lastModified).toISOString()` only as last resort.

c) **`JobDetail.tsx`**: When displaying, parse the stored `recorded_at` string. For display, use a helper that extracts the local date/time components from the original ISO string (preserving the offset), rather than relying on browser-local `toLocaleDateString()`. When the user manually edits the date/time, construct the ISO string with the original offset or the local browser offset.

d) **`export-payload.ts`**: Same fix — format date from the stored ISO string deterministically, not via browser locale.

e) **New helper `src/lib/recorded-date.ts`**: 
- `parseRecordedAt(iso: string)` — extracts year, month, day, hour, minute from the ISO string as originally recorded (respecting offset)
- `formatRecordedDate(iso: string)` / `formatRecordedTime(iso: string)` — for display
- Used by JobDetail and export-payload

**Existing job data**: The stored value `2026-04-12T10:34:24+00` is wrong (it's the file's lastModified, not the recording date). Since recovery is not deterministic (the original metadata is not stored), I will NOT auto-backfill. The user can manually correct it via the date picker.

**No schema migration needed** — the existing `recorded_at` (timestamptz) and `recorded_at_source` (text) columns are sufficient. The fix is about storing the correct value at upload time and displaying it correctly.

### Files changed

| File | Change |
|------|--------|
| `src/components/Navbar.tsx` | Remove LanguageSwitcher import and usage |
| `src/pages/Settings.tsx` | Replace audio LanguageSelector with UI language picker |
| `src/components/JobResults.tsx` | Remove standalone export row; add ExportButton to each tab's action bar |
| `src/lib/audio-creation-date.ts` | Return raw ISO string instead of Date; no `new Date()` parsing |
| `src/components/AudioUploader.tsx` | Update callback signature for new return type |
| `src/pages/Convert.tsx` | Use raw ISO string for recorded_at; update types |
| `src/pages/JobDetail.tsx` | Use deterministic date formatting from ISO string |
| `src/lib/export-payload.ts` | Use deterministic date formatting |
| `src/lib/recorded-date.ts` | New helper for parsing/formatting ISO date strings with offset preservation |
| `src/test/audio-creation-date.test.ts` | Update for new return type |

