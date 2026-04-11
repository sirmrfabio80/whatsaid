

# Add Time Editing to Job Date Picker

## What changes

**Single file**: `src/pages/JobDetail.tsx`

### 1. Display date AND time in the trigger button

Change the date badge from showing only "Apr 11, 2026" to "Apr 11, 2026 · 14:30". This uses the job's `created_at` timestamp which already stores the full date+time.

### 2. Add time input inside the popover

Below the calendar widget, add a styled `<input type="time">` with a subtle separator. The popover becomes:

```text
┌─────────────────────┐
│    « April 2026 »   │
│ Mo Tu We Th Fr Sa Su│
│  .  .  .  1  2  3  4│
│  5  6  7  8  9 10 11│
│ ...                  │
├─────────────────────┤
│  🕐  14:30           │
└─────────────────────┘
```

### 3. Preserve time when changing date, preserve date when changing time

- `handleDateChange`: merges the selected calendar day with the existing time from `jobDate`
- New `handleTimeChange`: merges the new HH:MM with the existing date from `jobDate`
- Both persist the combined `Date` to the `created_at` column (no schema change needed)

### 4. Semantic clarity

The `created_at` column already stores when the job was created (which corresponds to when the recording was uploaded). The UI will not label this as "created" or "modified" — it simply shows as the recording's date and time, which the user can adjust if needed.

### No other changes

- No database migration (timestamp column already supports date+time)
- No edge function changes
- No new components
- Location feature excluded (not viable as previously discussed)

### Styling

- Time input styled to match the premium theme: `bg-transparent`, subtle border-top separator, consistent font size
- Dark mode compatible via existing CSS variables
- Keyboard accessible (native time input supports arrow keys, tab)

