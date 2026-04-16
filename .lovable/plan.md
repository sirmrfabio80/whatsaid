

# AssemblyAI Quality Improvements

## Phase 1 — Config Levers (DEPLOYED)

Applied to `supabase/functions/transcribe/index.ts`:

1. EU endpoint (`api.eu.assemblyai.com/v2`)
2. `speech_threshold: 0.05`
3. `language_confidence_threshold: 0.4` (auto-detect only)
4. `speakers_expected` → `speaker_options` migration (omitted when no count specified)
5. `disfluencies: true` for recovery strategy
6. Code-switching instruction in recovery + review prompts only
7. Structured logging for all new params
8. `speech_model` persisted from AssemblyAI response

## Phase 2 — Transcript Quality Investigation

### A. What Exactly Failed (regression fixture)

#### 1. Speaker Split Failure
The raw AssemblyAI response already contains the wrong speaker boundary. The sentence "Scusa, ma dove? Stai chiamando direttamente dalla Romania, lei?" is one continuous phrase from one speaker, split across two speakers at 36703ms. The acoustic cause: the near-mic speaker asks a question, and the volume/timbre shift (phone speaker audio) **most likely triggered** a false speaker-switch in the diarization model.

#### 2. Wrong Words
The raw AssemblyAI response already contains "alla vagomania" with word-level confidences ~0.50. Ground truth is "dalla Romania". This is ASR misrecognition of a quiet, compressed phone-speaker voice. The 'd' of "dalla" was lost in noise, and "Romania" was garbled into the non-word "vagomania".

#### 3. Our App's Role
- The raw recognition error and speaker split failure **originate upstream** in the AssemblyAI output
- Our app currently **renders that output faithfully** — no downstream corruption
- Our app **does not currently detect, contain, or repair** suspicious low-confidence spans or suspicious speaker-boundary splits
- This means our product has no safety net for upstream ASR failures, which is a gap worth evaluating separately from the ASR config

### B. AssemblyAI Configuration Review

#### Most directly relevant lever: `speaker_options`
`speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 }` is the **most direct config lever** for the speaker-split problem. Constraining the diarization model to exactly 2 speakers forces it to reconsider boundary decisions. Highest-priority config change to test.

#### Test hypothesis: explicit `language_code: "it"`
The audio was already auto-detected as Italian. Explicit language forcing **may or may not** improve word recognition — treat as a **test hypothesis**, not a presumed fix. The regression test matrix will determine whether it makes a measurable difference.

#### Baseline evaluation: no prompt (U3P defaults)
AssemblyAI recommends starting with **no prompt** and evaluating prompted variants against that baseline. The "balanced" strategy (no prompt, no keyterms_prompt) should be the **primary baseline** in all testing.

#### `custom_spelling`
Useful for **recurring domain terms, proper nouns, names, and stable jargon**. **Not a fix for arbitrary one-off misrecognitions** like "vagomania" → "Romania".

#### What will NOT help for this specific failure
- `speech_threshold` — audio has plenty of speech
- `disfluencies` — irrelevant to word recognition
- `language_confidence_threshold` — language was correctly detected
- `multichannel` — single-channel recording
- `code_switching` prompt — monolingual Italian audio
- `format_text` / `punctuate` — not related to word recognition

### C. Recommended Action Order

#### Step 1: Run the test matrix (validate before committing)

| # | Config | Tests |
|---|--------|-------|
| 1 | **Balanced strategy, auto language, no speaker hint** | U3P defaults baseline |
| 2 | Balanced, auto language, `speaker_options: {min:2, max:2}` | Does speaker constraint fix the split? |
| 3 | Balanced, `language_code: "it"`, `speaker_options: {min:2, max:2}` | Does explicit Italian improve word recognition? |
| 4 | Recovery, auto language, `speaker_options: {min:2, max:2}` | Current strategy + speaker fix |
| 5 | Review, auto language, `speaker_options: {min:2, max:2}` | Does review grammar-check catch "vagomania"? |
| 6 | Keyterms with `keyterms_prompt: ["Romania"]`, `speaker_options: {min:2, max:2}` | Does keyterm hint fix the proper noun? |
| 7 | Config #3 + enhanced audio | Does preprocessing help the quiet speaker? |
| 8 | Config #3 + raw audio (no enhancement) | Is enhancement helping or hurting? |

Test #1 is critical — establishes the U3P default baseline. All other configs must be compared against it.

#### Step 2: Diarization constraint changes
Based on test matrix results, implement `speaker_options` improvements:
- When user selects explicit speaker count → send exact min/max
- When phone_call profile → consider defaulting to `{min:2, max:2}` if test confirms improvement
- When no count specified → omit `speaker_options` entirely (already implemented)

#### Step 3: Strategy / prompt comparisons
Based on test matrix results, evaluate whether:
- Default strategy for phone_call profile should change
- Any prompt variant demonstrably outperforms the no-prompt baseline
- Do NOT change strategy defaults without evidence

#### Step 4: Confidence-based repair layer (only if needed)
Only pursue if Steps 1-3 leave residual quality gaps:
- Scan word-level confidences for contiguous spans with avg < 0.5
- Targeted AI repair using surrounding sentence context
- Apply corrections only when AI confidence is high; mark in metadata
- Highest-complexity, highest-risk option — introduces hallucination vector

### D. Verdict

This is primarily an **acoustic challenge** (quiet phone-speaker voice) compounded by **missing diarization constraints**.

- Recognition and speaker-split failures originate upstream in AssemblyAI
- Our app renders faithfully but has no safety net for upstream failures
- `speaker_options` with exact speaker count is the most direct lever for diarization
- Explicit language forcing is a hypothesis to test, not a presumed fix
- U3P defaults (no prompt) must be the evaluation baseline
- Confidence-based repair is a last resort, not a first move

**Implementation order:** test matrix → diarization constraints → strategy/prompt changes → confidence-based repair (only if needed)
