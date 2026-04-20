

## Goal
Make the job detail screen reveal gracefully from top to bottom — title → metadata chips → tags → tabs/results card — instead of components popping in independently as their data resolves.

## Approach
Coordinate a single, ordered reveal sequence on the JobDetail screen using the existing `animate-fade-in` + stagger tokens (already in `src/index.css`). Each major block fades + slides in with an increasing delay, and we wait for the core data (`meta` + `JobResults` initial load) to be ready before triggering the sequence — so blocks don't fade in at different times based on when their fetches resolve.

## What changes

### 1. `src/pages/JobDetail.tsx`
- Remove the page-wide `animate-page-enter-flat` from the outer wrapper (it currently fires immediately, before data, which is what causes the staggered "pop").
- Add a `revealReady` boolean state that flips to `true` once the meta header is loaded AND `JobResults` has signalled its initial load is done (via a new optional `onReady` callback prop on `JobResults`).
- While `revealReady` is `false`, render a lightweight skeleton (using existing `LoadingState` / `Skeleton` tokens) for the back-bar + title + chips area, so layout doesn't jump.
- Once ready, render the real content with each section as its own animated block:
  - Block 1 (delay 0ms): top action bar (Back / New transcription)
  - Block 2 (delay 80ms): title row
  - Block 3 (delay 160ms): metadata chip row (date, duration, language, words, reading time, location)
  - Block 4 (delay 240ms): `JobDetailTags`
  - Block 5 (delay 320ms): `JobResults` card (tabs + content)
- Each block gets `motion-safe:animate-fade-in motion-reduce:animate-none` with an inline `style={{ animationDelay: "Xms", animationFillMode: "both" }}`, leveraging the existing `fade-in` keyframe (translateY(10px) → 0).

### 2. `src/components/JobResults.tsx`
- Remove the `animate-page-enter-flat` from the results wrapper (the parent now controls reveal timing).
- Add an optional `onReady?: () => void` prop. Call it once at the end of `fetchData()` (when `setLoading(false)` is reached) so the parent knows initial data is in.
- Keep the in-card `LoadingState` for the case where results render after the parent reveal (e.g. realtime updates), but suppress it during the initial reveal (parent already shows a skeleton).

### 3. No new tokens needed
- Reuse: `animate-fade-in` keyframe, `motion-safe` / `motion-reduce` guards, `LoadingState` skeleton component.
- `prefers-reduced-motion`: existing CSS already disables `.animate-fade-in` in reduced-motion mode, so the reveal degrades to an instant render — no extra work.

## Acceptance
- On opening a job, the screen reveals top-to-bottom in a single coordinated sequence (~500ms total).
- No block appears before the one above it, regardless of which fetch (meta, transcript, tags) resolves first.
- The skeleton holds the layout so there's no visible content shift when real data swaps in.
- With `prefers-reduced-motion: reduce`, everything appears instantly with no motion.
- Layout, copy, and existing functionality (editing title, status pulse, tag editor, tabs) are unchanged.

## Out of scope
- Animating individual transcript segments inside the transcript editor (would harm scroll/read performance).
- Changing the existing `LoadingState` skeleton visuals.
- Touching the Convert/History/Help reveal patterns.

