

# Fix: Move Q&A actions to the top of each entry

## Problem
On mobile (390px), the side-by-side layout compresses the answer text because the actions column (`shrink-0`) with "Include in export" checkbox and "Copy" button sits to the right, stealing horizontal space.

## Solution
Move the actions row **above** the Q&A content, as a compact top bar within each entry. The answer text then gets full width below.

### New layout
```text
┌─────────────────────────────────────────┐
│ ☐ Include in export            [Copy]   │
│─────────────────────────────────────────│
│ Q: question text                        │
│ answer text (full width)                │
└─────────────────────────────────────────┘
```

### Change — `src/components/JobResults.tsx` (lines 684–738)

Replace the current `flex items-start justify-between` wrapper with:

1. A **top row** (`flex items-center justify-between`) containing the checkbox+label on the left and Copy button on the right
2. The Q&A content below at full width (no `flex-1 min-w-0` constraint needed)

Single file, styling-only change. No logic or API modifications.

