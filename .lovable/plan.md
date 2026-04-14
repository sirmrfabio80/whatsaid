

# Show Segment Start Time in Transcript Editor

## What changes

**Single file**: `src/components/TranscriptEditor.tsx`

1. **Add `formatTimestamp` helper** (near top, after `parseSegments`):
   - Strips `[]` brackets from `[HH:MM:SS]`
   - Drops leading `00:` → shows `MM:SS` for sub-hour timestamps
   
2. **Render timestamp in both badge rows** — active-edit card (~line 510) and read-only segment (~line 664):
   - After the speaker badge (or unassigned badge), render:
     ```tsx
     {seg.timestamp && (
       <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums whitespace-nowrap select-none">
         {formatTimestamp(seg.timestamp)}
       </span>
     )}
     ```
   - `tabular-nums` ensures fixed-width digits
   - `whitespace-nowrap` prevents awkward wrapping
   - `select-none` keeps it non-selectable (reference metadata)
   - Visible in both read and edit modes

3. **No other changes** — no data model, no i18n, no API changes. Split segments with `timestamp: null` simply show no timestamp.

## Regression risks

None — purely additive. Existing edit, split, merge, reassign workflows are untouched.

