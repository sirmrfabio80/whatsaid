

# Speaker Reassignment UX Redesign

## A. UX Critique of Current Implementation

**1. Disconnected mental model.** The top speaker chips handle naming, adding, deleting, and AI suggestions. The transcript blocks handle text editing. Speaker reassignment is buried inside transcript editing — you must click "Edit Transcript", click a block, then find a small `Select` dropdown labeled "Change speaker". These two layers feel unrelated.

**2. Unclear unit of reassignment.** Nothing visually communicates that the transcript is block-based. In read mode, blocks run together as prose. A user cannot tell that each line is independently assignable.

**3. Passive dropdown.** The `Select` for changing speaker appears as a secondary control inside the edit card, below a label that says "Change speaker". It looks like a form field, not the primary action. Users editing text may not even notice it.

**4. No manual fallback hint.** When AI suggestions return zero results, a single `toast.info` fires and disappears. The user is left staring at the same UI with no guidance on what to do manually.

**5. No visual block boundaries.** In read mode, blocks have no separators, gutters, or speaker badges — just bold speaker names inline. This makes multi-speaker transcripts hard to scan.

---

## B. Recommended Redesigned Interaction Flow

### Principle: always-visible speaker label per block, no hidden dropdowns

**Read mode (default):**
- Each transcript block gets a subtle left gutter with a small **speaker badge** (pill with speaker display name, coloured dot or left-border colour-coded by speaker).
- Blocks have light separator spacing (already `mb-3`, keep it).
- No edit controls visible.

**Edit mode (after clicking "Edit Transcript"):**
- Each block's speaker badge becomes **clickable** — tapping it opens a small inline popover/dropdown anchored to the badge showing all available speakers as a list. Selecting one reassigns instantly (auto-saves, no separate "Save segment" step for speaker-only changes).
- Clicking the **text area** of a block opens the existing text editor for content edits (keep current flow).
- This separates the two actions: **badge click = reassign speaker**, **text click = edit text**.

**Zero-segment speaker hint:**
- When a newly added speaker has 0 segments, show a subtle inline hint below the speaker chips: *"To assign blocks to [Speaker Name], enter edit mode and click any speaker badge in the transcript."*
- This replaces reliance on the AI sparkle button as the primary affordance.

**AI suggestions unchanged:**
- Keep AI sparkle icon on zero-segment chips as a power-user shortcut.
- When AI returns 0 suggestions, show the same manual-assignment hint instead of just a toast.

**Split block (future — design only, do not implement):**
- In edit mode, when editing a block's text, show a "Split here" affordance (scissor icon or divider line) at cursor position or between sentences.
- Splitting creates two blocks; the second block defaults to the same speaker but the badge is immediately clickable to reassign.

### Interaction summary

```text
┌─────────────────────────────────────────────┐
│ Speaker chips: rename, add, delete, AI      │
├─────────────────────────────────────────────┤
│ [Edit Transcript]                           │
├─────────────────────────────────────────────┤
│ ● Dr Smith   "Hello, how are you today..." │  ← badge + text
│ ● Patient    "I've been having headaches.."│
│ ● Dr Smith   "Let me check your records.." │
└─────────────────────────────────────────────┘

Edit mode — click badge:
┌─────────────────────────────────┐
│ [Dr Smith ▾]  ← popover opens  │
│  ┌──────────────┐              │
│  │ Dr Smith   ✓ │              │
│  │ Patient      │              │
│  │ Nurse        │              │
│  └──────────────┘              │
└─────────────────────────────────┘

Edit mode — click text:
┌─────────────────────────────────┐
│ ● Dr Smith                      │
│ ┌─────────────────────────────┐ │
│ │ Hello, how are you today... │ │ ← textarea
│ └─────────────────────────────┘ │
│ [Save] [Cancel]                 │
└─────────────────────────────────┘
```

---

## C. Exact Files to Change

| File | Change |
|------|--------|
| `src/components/TranscriptEditor.tsx` | Add speaker badge per block in read+edit mode; make badge clickable in edit mode to open speaker popover; separate speaker-change from text-edit; add zero-suggestion manual hint |
| `src/components/JobResults.tsx` | Add zero-segment hint text below speaker chips; pass speaker-change-only save handler |
| `src/i18n/locales/en.json` | Add hint strings: `speakerChips.assignHint`, `speakerSuggestions.noSuggestionsHint` |
| `src/i18n/locales/fr.json` | French equivalents |
| `src/i18n/locales/it.json` | Italian equivalents |
| `src/index.css` | Optional: speaker colour-dot utility classes (2-3 lines) |

No backend, schema, edge function, export, share, or routing changes.

---

## D. Phased Implementation Order

**Phase 1 — Speaker badge per block (visual only, read mode)**
- Add a small speaker pill/badge with coloured left border to each block in `TranscriptEditor`.
- No behaviour change. Purely visual.
- Low risk: only adds markup to read-only rendering.

**Phase 2 — Clickable badge for reassignment in edit mode**
- In edit mode, clicking the speaker badge opens a `Popover` with speaker list.
- Selecting a speaker auto-saves (calls `onSave` with updated content).
- Clicking the text body still opens the text editor as before.
- Medium risk: must stop click propagation so badge click ≠ text edit click.

**Phase 3 — Zero-segment hint and improved no-suggestions fallback**
- Show inline hint below speaker chips when any speaker has 0 segments.
- Replace toast-only feedback on 0 AI suggestions with persistent inline hint.
- Low risk: additive UI only.

**Phase 4 (future, not implemented) — Split block**
- Design note only. Adds a split action inside the text editor.

---

## E. Regression Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Badge click propagation conflicts with block click handler | Medium | Use `e.stopPropagation()` on badge click; keep text-click handler on the text portion only |
| Speaker-only save triggers "transcript edited" badge prematurely | Low | It already does this for any `onSave` call — consistent behaviour |
| Speaker colour assignment for >6 speakers | Low | Use modular colour array, cycle if exceeded |
| AI suggestion preview highlights conflict with new badge styling | Low | Suggestion highlights already use left-border; badge sits in a gutter area, no overlap |
| Existing text editing flow breaks | Low | Text editing is triggered by clicking the text body, unchanged; badge is a separate click target |

