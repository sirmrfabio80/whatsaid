

# Questions Tab: Markdown Rendering, Export Inclusion Controls, and Export Access

## Changes

### 1. Export `SectionBody` from `StructuredSummary.tsx`
Add named export so it can be reused for Q&A answer rendering.

### 2. Update `JobResults.tsx` — three changes

**A. Markdown rendering for Q&A answers (lines 583-585)**
Replace raw `whitespace-pre-wrap` text with `<SectionBody body={...} />` — the same component used in Summary. This handles bold, bullets, paragraphs, and spacing.

**B. "Include in export" checkbox on each Q&A card**
- Add `excludedQAIds` state (`Set<string>`) — tracks which entries are excluded (default: all included).
- Each Q&A card gets a checkbox with label "Include in export", checked by default. Toggling it adds/removes the entry ID from the excluded set.
- Visual indicator: when unchecked, the card gets a subtle `opacity-60` treatment so the user immediately sees it won't be exported.
- Accessible: proper `<label>`, keyboard-focusable, `aria-label` describing the action.

**C. Export actions bar above Q&A list (when entries exist)**
- Add a bar matching the other tabs' style: "Copy All" button + Export dropdown (TXT, JSON, DOCX, PDF).
- **All exports respect the inclusion set** — only non-excluded Q&A entries are included.
- The existing `buildExportPayload()` and `handleDownloadAllJson()` will be updated to accept an optional filter, so the global export from Transcript/Summary tabs also respects exclusions.

### 3. Export behaviour — explicit and consistent

| Export from | What's included |
|---|---|
| Transcript tab Export | Transcript + Summary + **included** Q&A |
| Summary tab Export | Transcript + Summary + **included** Q&A |
| Questions tab Export | Transcript + Summary + **included** Q&A |

All tabs use the same `buildExportPayload()` which filters by `excludedQAIds`. No confusing differences.

**Q&A-only TXT export** from the Questions tab will export only the included Q&A items (not transcript/summary), giving users a focused Q&A-only text file.

### 4. Accessibility

- Checkbox uses shadcn `Checkbox` component with proper `id` and `<label htmlFor>`.
- Focus ring visible on keyboard navigation.
- Screen reader: label reads "Include [question text] in export".
- The Q&A export bar buttons follow the same accessible patterns as existing action bars.

## Files changed
- `src/components/StructuredSummary.tsx` — export `SectionBody`
- `src/components/JobResults.tsx` — markdown rendering, inclusion checkboxes, Q&A export bar, updated export payload filtering

## No changes
- No backend/schema changes
- No edge function changes  
- No changes to other pages or tabs' layout

