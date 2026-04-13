

# Revised Plan: Improve Speaker Diarization for Phone Calls

## Problem
Job `27ac40d1-702a-4c7f-9b96-40b98374bea0` transcribed both voices correctly but merged them into a single `Speaker A`. The audio is a phone call with volume imbalance between speakers.

## Change
Add `speakers_expected: 2` to the AssemblyAI transcription payload. This is a documented, supported parameter that hints the diarizer to look for exactly 2 speakers, improving separation when one voice is quieter.

**`audio_boost` is removed** — no documentation found confirming it as a supported parameter on the `/v2/transcript` endpoint.

## File touched
`supabase/functions/transcribe/index.ts` — one line added to the payload object (line 61-65):

```typescript
const transcriptPayload: Record<string, unknown> = {
  audio_url: signedUrlData.signedUrl,
  speech_models: ["universal-3-pro"],
  speaker_labels: true,
  speakers_expected: 2,  // hint for diarizer
};
```

No other files touched. No schema changes. No UI changes.

## Post-deployment verification
1. Reprocess the same audio file (`Fatebenefratelli.m4a`)
2. Compare against the current result:
   - Speaker count: was 1 (`Speaker A` only)
   - Check if utterances are now split across `Speaker A` and `Speaker B`
   - Confirm the quieter phone voice is attributed to a separate speaker

## Risk
- **Low**: `speakers_expected` is a soft hint per AssemblyAI docs. If the model detects more speakers, it can still return them.
- **Concern**: Hardcoding `2` may slightly bias multi-speaker meetings. AssemblyAI treats it as a hint, not a hard cap, so impact should be minimal.

## Rollback
Remove the one line. Redeploy.

## Follow-up (if needed)
If testing shows this helps phone calls but harms meetings, propose a user-selectable "Number of speakers" option on the upload form as a separate change.

