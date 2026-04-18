

## Plan: Fix "Invalid key" upload error from Unicode characters in filenames

### Root cause
`Villa Ida - Monica’s report.m4a` contains a curly apostrophe `’` (U+2019). Supabase Storage rejects keys with non-ASCII characters and certain symbols, returning `Invalid key: <path>`. The path is built as `${user.id}/${jobId}/${uploadFile.name}` in `src/pages/Convert.tsx:316` with no sanitization. The same uploaded name is also produced by `enhanceAudioForTranscription` in `src/lib/audio-enhance.ts:180`, which preserves the original base name.

This affects every user uploading a file whose name contains: curly quotes (’ ‘ “ ”), em/en dashes (— –), accented letters (é, à, ñ…), emoji, or any non-ASCII character — common with iOS-recorded files where the OS auto-inserts curly apostrophes.

### Fix (single phase, minimal blast radius)

**1. Add a small filename-sanitization helper**
- New file `src/lib/sanitize-filename.ts` exporting `sanitizeStorageFilename(name: string): string`.
- Behavior:
  - Split into base + extension.
  - Normalize Unicode with `.normalize("NFKD")` and strip combining diacritics → `é` becomes `e`.
  - Replace any character outside Supabase's safe set (`A-Za-z0-9._-`) with `_`. (We deliberately use a stricter set than Supabase technically allows so we never hit edge cases with `&`, `+`, `?`, etc.)
  - Collapse runs of `_` into one, trim leading/trailing `_` and `.`.
  - If base ends up empty, fall back to `audio`.
  - Lower-case the extension; if missing, leave as-is (caller already controls extension in the enhanced path).
  - Cap total length to ~120 chars to stay well under storage limits.

**2. Use it in `src/lib/audio-enhance.ts`**
- Replace `const baseName = file.name.replace(/\.[^.]+$/, "")` with a sanitized base via the helper, then keep the `_normalised.mp3` suffix. This guarantees the produced `File`'s name is always storage-safe.

**3. Use it defensively in `src/pages/Convert.tsx`**
- When constructing `filePath`, sanitize `uploadFile.name` once more. This covers:
  - The non-enhanced branch (e.g. `.wav` files that bypass enhancement).
  - Any future code path that produces an upload file.
- Concretely: `const safeName = sanitizeStorageFilename(uploadFile.name); const filePath = \`${user.id}/${newJobId}/${safeName}\`;`

**4. Backend / DB impact: none**
- The original filename is already stored separately in `jobs` (file_name / display fields, used by history & exports). Storage key is internal — sanitizing it does not affect what the user sees in History, Share, or PDF exports. Quick check during implementation: confirm `jobs.file_name` (or equivalent) is set from `file.name` (the original `File`), not from `uploadFile.name`. If it's currently set from `uploadFile.name`, also pass through the original `file.name` so users keep seeing `Villa Ida - Monica's report.m4a` in the UI.

**5. No migration, no edge function changes**
- Edge functions read the storage path the client just uploaded to and pass it back; sanitizing client-side end-to-end is sufficient.

### Regression checks
- Upload `Villa Ida - Monica's report.m4a` → succeeds, key looks like `<uid>/<jobid>/Villa_Ida_-_Monicas_report_normalised.mp3`.
- Upload a plain ASCII `.wav` (bypasses enhancement) → still works, name only changes if it had unsafe chars.
- Upload `réunion équipe.m4a` → succeeds as `reunion_equipe_normalised.mp3`.
- Upload an emoji-only-named file `🎤.m4a` → falls back to `audio_normalised.mp3`.
- History / Share / PDF still show the original human filename, not the sanitized storage key.

### Files touched
- `src/lib/sanitize-filename.ts` (new, ~25 lines)
- `src/lib/audio-enhance.ts` (1-line change at line 180 area)
- `src/pages/Convert.tsx` (sanitize before building `filePath`; verify display name preserved)

