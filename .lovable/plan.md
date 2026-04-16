

# AssemblyAI Quality Improvements — Implementation Plan

## Summary
Apply the highest-impact, lowest-risk quality levers to `supabase/functions/transcribe/index.ts`. One file changed, one deploy.

## Changes (all in `supabase/functions/transcribe/index.ts`)

### 1. Switch to EU endpoint
- Line 9: Change `ASSEMBLYAI_BASE` from `https://api.assemblyai.com/v2` to `https://api.eu.assemblyai.com/v2`
- Also update the DELETE call (line 373) which already uses `ASSEMBLYAI_BASE`, so it inherits automatically

### 2. Add `speech_threshold: 0.05`
- Add to `transcriptPayload` object (after line 83)
- Add error handling in the poll loop: if AssemblyAI returns an error mentioning insufficient speech, surface a user-friendly error message like "Not enough speech detected in the audio"

### 3. Add `language_confidence_threshold: 0.4`
- Add to `transcriptPayload` only when `language_detection: true` (inside the else block, ~line 89)
- Handle the error case: if transcription fails due to low confidence, set a clear error message suggesting manual language selection

### 4. Migrate `speakers_expected` → `speaker_options`
- Replace lines 147-149: instead of `transcriptPayload.speakers_expected = N`, send `transcriptPayload.speaker_options = { min_speakers_expected: N, max_speakers_expected: N }`
- When no speaker count is specified, send `speaker_options: { min_speakers_expected: 1 }` as a harmless default hint
- Update the legacy `phone_call` profile (line 133) to use the new shape
- Update the structured log and saved `transcription_config` to reflect the new param name

### 5. Add `disfluencies: true` for recovery strategy
- When strategy is `"recovery"`, add `transcriptPayload.disfluencies = true`
- Simplify the recovery prompt: remove the disfluency-specific instruction (line 100: "Mandatory: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts...") since the API param now handles this
- Keep the code-switching and best-guess instructions in the recovery prompt

### 6. Add code-switching instruction to review prompt only
- Prepend `"Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.\n\n"` to the existing review prompt
- **Do NOT add any prompt to balanced/default strategy** — U3P's built-in default prompt already handles multilingual code-switching
- **Do NOT modify keyterms strategy** — `keyterms_prompt` is appended to the default prompt automatically

### 7. Update structured logging
- Add new params to the routing log: `speech_threshold`, `language_confidence_threshold`, `speaker_options`, `disfluencies`
- Update saved `transcription_config` object to include the new params

## Prompt state after changes

| Strategy | `prompt` | `keyterms_prompt` | `disfluencies` |
|----------|----------|-------------------|----------------|
| balanced | omitted | omitted | omitted |
| recovery | code-switch + best-guess instructions (no disfluency text) | omitted | `true` |
| review | code-switch + review instructions | omitted | omitted |
| keyterms | omitted | user terms | omitted |

## Not changed
- No UI changes
- No new edge functions
- No schema migrations
- No changes to post-process, identify-speakers, or any other function
- No region selection UI anywhere

## Risk assessment
- All changes are additive params to an existing working request
- `speech_threshold: 0.05` is very conservative (rejects only near-silent files)
- `language_confidence_threshold: 0.4` is conservative
- `speaker_options` is the official replacement for `speakers_expected`
- EU endpoint has full feature parity per AssemblyAI docs

