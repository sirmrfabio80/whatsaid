

# Optimize AssemblyAI for Mono iPhone Voice Memo Phone-Call Recordings

## Diagnosis

The primary remaining issue **appears** to be AssemblyAI performance on a specific acoustic pattern: mono iPhone Voice Memo recordings of phone calls, where one voice is local (close to mic) and one is remote (coming through the phone speaker at lower volume and quality).

However, we also identified at least one real post-processing / editor correctness bug: `reconstructContent` in `TranscriptEditor.tsx` strips `[HH:MM:SS]` timestamp prefixes on edit, permanently losing temporal data.

Therefore **both** transcription configuration and post-processing correctness still matter, even if the biggest expected gain is likely from better diarization constraints.

## Phase 1: Add and test diarization constraints (highest expected impact)

**What**: Add support for `speakers_expected: 2` in the AssemblyAI request payload. Investigate whether AssemblyAI also supports `speaker_count_min` / `speaker_count_max` bounds and, if safe, compare those too.

**Why**: `speakers_expected: 2` is the most promising low-risk change for this audio pattern. It is expected to help reduce speaker fragmentation and improve short-interjection attribution, but results must be validated on real files.

**Files**: `supabase/functions/transcribe/index.ts`

**Changes**:
- Read `speakers_expected` from `jobs.transcription_config` (column already exists)
- If present, include it in the AssemblyAI payload
- Keep `speaker_labels: true` — diarization stays enabled
- Log the constraint in both routing and completion events

**Risk**: None — optional parameter, backward compatible, ignored if not set.

**Test**: Set `transcription_config: {"speakers_expected": 2}` directly on a job row, run the same Italian phone-call audio, compare diarization quality against baseline.

## Phase 2: Strengthen A/B evaluation logging

**What**: Enhance completion logging so we can compare runs cleanly.

**Why**: Without structured logging we cannot evaluate whether Phase 1 changes actually helped.

**Files**: `supabase/functions/transcribe/index.ts`

**Changes**:
- Log `speakers_expected`, any min/max bounds, and `profile` in routing and completion events
- Add `word_count`, `confidence_min`, `confidence_p25` (25th percentile) to completion log
- Log `words_per_utterance_avg` to help detect dropped content
- Ensure `transcription_config` on the `jobs` row captures the full config sent

**Risk**: None — logging only, no behaviour change.

**Test**: Run a job, verify logs contain new fields. Compare two runs of the same file with different configs.

## Phase 3: Fix timestamp preservation bug in TranscriptEditor

**What**: `reconstructContent()` rebuilds content as `Speaker: text` without the `[HH:MM:SS]` prefix. Any user edit permanently loses timestamps.

**Files**: `src/components/TranscriptEditor.tsx`

**Changes**:
- Add `timestamp: string | null` to the `Segment` interface
- Update `parseSegments` to capture and store the timestamp from the `[HH:MM:SS]` prefix
- Update `reconstructContent` to re-include the timestamp when present
- Update `reassignSpeaker`, `splitSegment`, `mergeUp` to preserve timestamps

**Risk**: Medium — touches the editor's core data model, but this is a correctness fix that preserves existing data rather than changing behaviour.

**Test**: Edit a transcript segment, save, verify timestamps survive. Split/merge segments, verify timestamps survive.

## Phase 4: Profile-based tuning support

**What**: Add a `profile` field to `transcription_config` (e.g. `"phone_call"`) that activates preset diarization settings. Only implement after Phase 1-2 results show which settings actually help.

**Files**: `supabase/functions/transcribe/index.ts`

**Changes**:
- Define a `PROFILES` map: `{ phone_call: { speakers_expected: 2 } }`
- If `tuningConfig.profile` is set, merge profile defaults under explicit overrides
- Log profile in events

**Risk**: None — additive, optional, backward compatible.

**Test**: Set `transcription_config: {"profile": "phone_call"}` on a job, verify `speakers_expected: 2` is sent.

## Phase 5: Audio preprocessing (deferred)

Deferred unless Phases 1-4 prove insufficient. Dynamic range compression to boost the quieter remote voice is technically possible but high-effort in Deno edge functions and uncertain in benefit.

## Scope boundaries

- No UI changes
- No export changes
- No transcript format changes
- No provider switch
- No changes to auth, billing, routing, or unrelated features
- Backend transcription pipeline, logging, and timestamp bug fix only

## Files touched

| File | Phase | Change |
|------|-------|--------|
| `supabase/functions/transcribe/index.ts` | 1, 2, 4 | Diarization constraints, enhanced logging, profile support |
| `src/components/TranscriptEditor.tsx` | 3 | Fix timestamp preservation through edit lifecycle |

