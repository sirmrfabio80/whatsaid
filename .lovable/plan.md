

# Fix Speaker Detection + Simplify UI — Final Plan

## Product decision

WhatSaid's target use case is conversational audio: meetings, interviews, phone calls, and voice recordings. Based on real user testing, the default transcription flow failed to detect a second speaker on a mono phone-call recording unless both audio enhancement and the recovery transcription strategy were enabled together.

This plan makes an intentional product choice to optimise defaults for WhatSaid's core use case — recovering all speakers and all speech — accepting that this may produce slightly noisier transcripts in some already-clean recordings.

## New hidden defaults

| Setting | Default | Why |
|---------|---------|-----|
| `enhanceAudio` | `true` | Dynamic range compression reduces loudness imbalance, helping detect quieter speakers. For already-balanced audio, the effect is minor but may subtly alter the signal. |
| `strategy` | `"recovery"` | The recovery prompt instructs the STT provider to try harder on faint or ambiguous speech. This produced correct two-speaker detection in the failing test audio. It may also increase disfluencies or background-noise transcription in clean recordings. |

These are product defaults based on observed behaviour, not universal technical truths.

## Changes — `src/pages/Convert.tsx` (single file)

1. Set initial `transcriptionConfig` to `{ strategy: "recovery", enhanceAudio: true }`
2. Remove the `Collapsible` / `TranscriptionSettings` advanced options section
3. Remove `autoOptimised` state, badge, dismiss logic
4. Remove `advancedOpen` state and `handleConfigChange`
5. Remove mono `.m4a` phone-call heuristic in `handleFileSelected` (redundant)
6. Clean up unused imports
7. Keep "Enhancing audio" progress step visible

No backend changes. No migration.

## Risks

| Risk | Likelihood | Detail |
|------|-----------|--------|
| Noisier transcripts on clean recordings | Moderate | Recovery strategy may transcribe background sounds or disfluencies that balanced mode would skip |
| Enhancement altering already-good audio | Low-moderate | Compression changes dynamic range even when input is balanced; effect is usually subtle but nonzero |
| Users who preferred balanced mode lose access | Certain | Intentional product decision — simplicity over configurability |
| Original bug not fixed | Very low | Exact combination proven to work in user's test |

## Validation plan

Test with three recordings:
1. **The known failing audio** (mono phone call) — must produce 2 speakers with zero manual settings
2. **A clean single-speaker recording** — verify transcript quality is acceptable
3. **An ordinary multi-speaker conversation** — verify speaker separation and quality remain good

## Rollback path (if validation shows degradation)

If normal clean recordings are noticeably degraded, rollback in this order — no UI changes in any case:

1. **First**: revert `strategy` to `"balanced"`, keep `enhanceAudio: true`. This is the most likely culprit for added noise/disfluencies on clean audio. One line change in `Convert.tsx`.
2. **Second** (only if step 1 is insufficient): revert `enhanceAudio` to `false`, keep `strategy: "recovery"`. Less likely to be the issue but isolates the other variable. One line change.
3. **Last resort**: revert both to original defaults. This re-exposes the original bug but restores baseline quality.

Advanced UI options are **not** reintroduced as a fallback. The rollback is internal config only.

