

# Fix: Extract Apple M4A creation date from `com.apple.quicktime.creationdate`

## Problem confirmed

The current `extractAudioCreationDate` only reads the `mvhd` atom, which for Apple recordings is often 0 or a UTC-shifted value. The actual "Date Created" visible in Finder comes from `com.apple.quicktime.creationdate` stored in `moov > udta > meta > keys/ilst`. Since extraction fails, the code falls back to `file.lastModified` — producing the wrong date entirely.

Database proof: job `96f85f8e` has `recorded_at_source: "file_last_modified"` and `recorded_at: 2026-04-11 13:37:03+00` instead of `2026-03-13 10:49:xx`.

## Changes

### 1. Rewrite `src/lib/audio-creation-date.ts`

Add Apple QuickTime metadata extraction before the `mvhd` fallback:

- **New function `extractAppleCreationDate(buffer)`**:
  - Find `moov > udta > meta` box
  - Skip the 4-byte version/flags header inside `meta` (the current `findBox` doesn't account for this — add a variant or offset parameter)
  - Parse the `keys` atom: read the key count, iterate key entries to find the index of `com.apple.quicktime.creationdate`
  - Parse the `ilst` atom: locate the entry at the matching 1-based index, read its `data` sub-box, extract the UTF-8 ISO 8601 string (e.g. `2026-03-13T10:49:00+0100`)
  - Parse the ISO string with `new Date(isoString)` — this preserves timezone correctly since the string includes the offset

- **Priority order**:
  1. `com.apple.quicktime.creationdate` → most accurate, includes local timezone
  2. `mvhd` creation_time → UTC fallback
  3. Return `null` → caller uses `file.lastModified`

- **`findBox` enhancement**: Add an optional `skipBytes` parameter so that when recursing into a `meta` box, we can skip the 4-byte version/flags header before searching for child boxes

### 2. Add console.log for verification

Temporarily log the raw extracted ISO string and the resulting `Date` object so we can verify the exact values in the user's next test upload. These logs will be reported back per the user's request.

### 3. No other file changes needed

- `AudioUploader.tsx` already calls `extractAudioCreationDate` and passes the result
- `Convert.tsx` already stores `fileCreationDate` as `recorded_at` with source `"file_creation_date"`
- `JobDetail.tsx` already reads `recorded_at` and displays it

### Verification checklist (will be reported after implementation)

1. Raw extracted metadata value for the test file
2. Stored `recorded_at` value in the database
3. Timezone correctness (ISO string includes offset, no unexpected shift)
4. Calendar picker shows exact same local date and time as source metadata
5. No fallback to `file.lastModified` when Apple metadata exists
6. Consistency across upload step, convert page, job page, and editable date/time UI

