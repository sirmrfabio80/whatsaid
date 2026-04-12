

## Export Consolidation Plan (Refined)

### Changes from previous plan

| Area | Previous | Refined |
|------|----------|---------|
| UI label | "DOCX" / "Word (.docx)" | **"DOC"** in UI; file extension stays `.docx` |
| Formatting logic | New formatting in payload builder | **Reuse existing**: `formatDuration()` from `pricing.ts`, `getLanguageLabel()` from `languages.ts`, `applySpeakerNames()` from `JobResults.tsx`, date via `toLocaleDateString()` matching `JobDetail.tsx` line 199 |
| Empty sections | Undefined | **Omit** missing sections entirely — never show placeholder text, never produce broken structure |
| Section order | Transcript → Summary → Q&A | **Summary → Q&A → Transcript** (matches requirement) |
| Page breaks | Only before Q&A | Before Q&A **and** before Transcript (DOC + PDF) |
| Validation | Implicit | Explicit checklist added |

---

### Architecture

```text
JobDetail.tsx / JobResults.tsx
        │
        ▼
  ExportButton.tsx  ← single UI component, format picker: TXT / JSON / DOC / PDF
        │
        ▼
  buildCanonicalPayload()  ← src/lib/export-payload.ts
  (reuses formatDuration, getLanguageLabel, applySpeakerNames, toLocaleDateString)
        │
        ▼
  ┌─────┼─────┬─────┐
  TXT  JSON  DOCX  PDF   ← each consumes CanonicalExportData
```

### 1. `CanonicalExportData` interface (`export-types.ts`)

```typescript
interface CanonicalExportData {
  title: string;                    // resolved display title
  createdAt: string;                // pre-formatted date string (e.g. "Apr 12, 2026")
  duration: string | null;         // pre-formatted "12:34" via formatDuration()
  language: string | null;         // display label via getLanguageLabel()
  summary: string | null;          // with speaker names applied
  questions: { prompt: string | null; answer: string }[] | null;  // filtered, speaker names applied
  transcript: string | null;       // with speaker names applied
}
```

All values are **display-rendered**. No raw codes, timestamps, or IDs.

### 2. `buildCanonicalPayload()` (`src/lib/export-payload.ts`)

Accepts job meta, outputs, speaker names, excluded Q&A IDs. Returns `CanonicalExportData`.

**Critical rule**: Does NOT introduce parallel formatting. Reuses:
- `formatDuration(seconds)` from `@/lib/pricing`
- `getLanguageLabel(code)` from `@/lib/languages`
- `applySpeakerNames(text, names)` — extracted from `JobResults.tsx` to a shared util
- Date formatting: `new Date(recorded_at ?? created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })` — same pattern as `JobDetail.tsx` line 199

`applySpeakerNames` and `escapeRegex` move to `src/lib/speaker-names.ts` (shared between `JobResults.tsx` and `export-payload.ts`).

### 3. `ExportButton.tsx` (`src/components/ExportButton.tsx`)

Single dropdown button. Format options labelled:
- **TXT** — Plain text (.txt)
- **JSON** — JSON (.json)
- **DOC** — Document (.doc)
- **PDF** — PDF (.pdf)

States: disabled (no outputs ready), loading (export in progress), success toast, error toast.

Placed once on the job page, outside tabs. Receives all data needed to call `buildCanonicalPayload()`.

### 4. Format exporters (all consume `CanonicalExportData`)

**TXT** (`src/lib/export-txt.ts`) — New file.
- Section headings as plain text with separator lines
- Same section order: Title → Meta → Summary → Q&A → Transcript
- Sections with null values are omitted entirely

**JSON** — Updated in `export.ts` or new `export-json.ts`.
- Structured object with display values only
- Same section order; null sections omitted from output

**DOCX** (`src/lib/export.ts`) — Updated.
- Consumes `CanonicalExportData` instead of `ExportPayload`
- Section order: Title → Meta → Summary → Q&A (page break) → Transcript (page break)
- Null sections omitted; no "customOutput" section (removed)
- File extension `.docx`, UI label "DOC"

**PDF** (`src/lib/export-pdf.ts`) — Updated.
- Same changes as DOCX
- Page breaks before Q&A and Transcript sections

### 5. `JobResults.tsx` changes

- Remove `ActionsBar` component (the per-tab export dropdown)
- Remove `handleDownloadAllJson`, `handleExportDocx`, `handleExportPdf`, `buildExportPayload`
- Remove per-tab TXT download logic
- Keep per-tab **Copy** buttons (copy remains tab-scoped)
- Extract `applySpeakerNames` and `escapeRegex` to `src/lib/speaker-names.ts`, import from there
- Render `<ExportButton />` once, above or below the tabs

### 6. Empty section handling

| Section | If missing/empty | Behaviour |
|---------|-----------------|-----------|
| Summary | null | Omit section from all formats |
| Q&A | Empty after filtering | Omit section from all formats |
| Transcript | null | Disable export entirely (button disabled) |

No placeholder text. No broken documents. Transcript is required for export to be available.

### 7. Files touched

| File | Action |
|------|--------|
| `src/lib/speaker-names.ts` | **Create** — extract `applySpeakerNames`, `escapeRegex` |
| `src/lib/export-payload.ts` | **Create** — `buildCanonicalPayload()` |
| `src/lib/export-txt.ts` | **Create** — TXT exporter |
| `src/components/ExportButton.tsx` | **Create** — unified export UI |
| `src/lib/export-types.ts` | **Update** — add `CanonicalExportData` |
| `src/lib/export.ts` | **Update** — DOCX uses canonical data, new section order, page breaks |
| `src/lib/export-pdf.ts` | **Update** — PDF uses canonical data, new section order, page breaks |
| `src/components/JobResults.tsx` | **Update** — remove per-tab exports, add ExportButton, use shared speaker-names |

### 8. Validation checklist

- [ ] Same job exports identical content across TXT, JSON, DOC, PDF
- [ ] Export is independent of active tab
- [ ] Exported date matches UI date exactly
- [ ] Exported duration matches UI duration exactly
- [ ] Exported language label matches UI label exactly
- [ ] Speaker names in transcript match UI display
- [ ] Section order: Title → Meta → Summary → Q&A → Transcript
- [ ] Q&A starts on new page in DOC and PDF
- [ ] Transcript starts on new page in DOC and PDF
- [ ] Missing summary → section omitted, no crash
- [ ] Empty Q&A after filtering → section omitted, no crash
- [ ] Missing transcript → export button disabled
- [ ] UI shows "DOC" not "DOCX"
- [ ] No parallel formatting logic exists — all display values reuse existing helpers

