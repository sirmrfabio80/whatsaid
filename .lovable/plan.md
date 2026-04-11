

# Change duration icon in calendar popover

## Change

**File**: `src/pages/JobDetail.tsx`

Line 232: Replace `<Clock>` with `<Timer>` (from lucide-react) for the duration row. This visually distinguishes it from the time picker row above which already uses `<Clock>`.

- Add `Timer` to the existing lucide-react import on line 11
- Change `<Clock className="w-3.5 h-3.5 shrink-0" />` to `<Timer className="w-3.5 h-3.5 shrink-0" />` on line 232

No other changes needed.

