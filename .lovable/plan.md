

# Disable Auto-Multichannel Routing + Retranscribe Affected Job

## Change

**Single file**: `supabase/functions/transcribe/index.ts`

Replace line 66:
```typescript
const isMultichannel = typeof job.audio_channels === "number" && job.audio_channels >= 2;
```

With:
```typescript
const isMultichannel = false;
```

Preceded by an explicit comment block (replacing lines 61-66) explaining:
- Automatic channel-count-based routing caused regressions on real uploads
- Stereo files with mixed/identical channels lost speaker separation
- Diarization-first is the safe default for all files
- Multichannel can be re-enabled later only behind explicit user opt-in / Advanced UI
- All groundwork (channel detection, logging, dormant multichannel path) is preserved

## After deployment

1. Deploy the updated edge function
2. Retranscribe job `27ac40d1-702a-4c7f-9b96-40b98374bea0` by invoking the `regenerate` function
3. Verify Speaker B is restored in the output
4. Confirm structured logs still emit correctly

## What stays intact
- `audio_channels` column and client-side detection
- Structured `transcription_routing` and `transcription_completed` logs
- Dormant multichannel transcript-building code (Speaker A/B mapping)
- All UI components unchanged

## Risk
None. This reverts to the original working diarization path for all uploads.

