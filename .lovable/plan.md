

## Add indeterminate shimmer bar under "Enhancing audio…" row

Give users a visible signal of activity while local audio enhancement runs (which can take 30–90s on long files), without exposing technical substages.

### Behaviour

- A thin (2px) indeterminate progress bar appears **only** under the currently-active step row, and **only** while `step === "enhancing"`.
- The bar uses an animated gradient sweep that loops continuously left-to-right — no percentage, no jumps, just steady motion conveying "still working".
- Once the step advances to `uploading`, the bar disappears (the spinner moves to the next row as it does today).
- Other in-progress steps (uploading, transcribing, summarising) keep the existing inline spinner only — no shimmer there, since enhancement is the slow local phase that motivated this.
- Respects `prefers-reduced-motion`: when the user prefers reduced motion, the bar renders as a static thin primary-tinted line instead of animating.

### Changes

**`tailwind.config.ts`**
- Add a new keyframe `shimmer-slide` that translates a gradient from `-100%` to `100%` on the X axis.
- Add an animation utility `shimmer: "shimmer-slide 1.6s ease-in-out infinite"`.

**`src/pages/Convert.tsx`** (inside the step row map, around lines 550–574)
- After the existing flex row containing the icon + label, when `s === "enhancing" && isCurrent && step !== "failed"`, render a 2px-tall track:
  ```tsx
  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-primary/10 motion-reduce:bg-primary/30">
    <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer motion-reduce:animate-none motion-reduce:w-full motion-reduce:bg-primary/40 motion-reduce:bg-none" />
  </div>
  ```
- Wrap the existing flex row + the new bar in a single column container (`flex flex-col` instead of `flex items-center`) so the bar sits flush under the row, still inside the `bg-primary/10` highlighted card.

### Accessibility

- Bar is purely decorative (the `InlineSpinner` already conveys activity for assistive tech). No `role="progressbar"` is added, since the value is not knowable.
- `motion-reduce:` variants disable the sliding animation for users with reduced-motion preferences and fall back to a soft static tint.
- Contrast of the shimmer respects the existing primary token in both light and dark themes.

### Out of scope

- No change to the worker, streaming wrapper, DB, or i18n.
- No real percentage progress (would require extending the worker protocol — separate task).
- No shimmer under other steps.

### Validation

- Long M4A: while "Enhancing audio…" is active, a continuous left-to-right shimmer plays under the row; it stops the instant the step flips to "Uploading audio…".
- Short M4A where enhancement finishes in <1s: bar appears briefly, no flicker artefact.
- OS-level "reduce motion" enabled: row shows a static thin tinted bar, no animation.
- Light + dark themes: bar is visible but understated in both.

