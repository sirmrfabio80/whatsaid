

# Re-identify Speakers Button

## What it does

Adds a button in the SpeakerChips bar (after "Reset names") that manually re-runs the `identify-speakers` edge function. This lets users trigger speaker name detection from transcript content on demand — useful after resetting names or editing the transcript.

## UI placement

In the SpeakerChips row, after the existing "Reset names" button:

```text
[Speaker A ✏] [Speaker B ✏] [+ Add]  Reset names  ↻ Identify speakers
```

- Small ghost button, same style as "Reset names"
- Shows a spinner while running
- Always visible when there's a transcript with speakers (not gated behind `hasRenames`)

## Files to change

| File | Change |
|---|---|
| `src/components/SpeakerChips.tsx` | Add `onIdentifySpeakers?: