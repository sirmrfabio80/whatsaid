

# Test Matrix Runner — Implementation Plan

## Approach
Create a single new edge function `eval-transcribe` that:
1. Accepts an audio file path in `temp-audio` storage
2. Runs all 8 configs sequentially against AssemblyAI (same audio, different params)
3. For each run, extracts the 34–38s window (utterances, words, speakers, confidences)
4. Returns a compact JSON comparison report

This is internal-only — no UI, no product code changes. Invoked via the edge function curl tool or a direct HTTP call.

## Why edge function over script
- Already has `ASSEMBLYAI_API_KEY` and Supabase access
- Deploys instantly, testable via curl
- No local environment setup needed
- Can be deleted after evaluation

## Edge function: `supabase/functions/eval-transcribe/index.ts`

### Input
```json
{
  "storage_path": "path/to/file/in/temp-audio",
  "configs": [1,2,3,4,5,6,7,8]  // optional subset
}
```

### Config matrix (hardcoded)
| # | Strategy | Language | Speaker Options | Extra |
|---|----------|----------|-----------------|-------|
| 1 | balanced | auto | none | baseline |
| 2 | balanced | auto | {min:2,max:2} | |
| 3 | balanced | it | {min:2,max:2} | |
| 4 | recovery | auto | {min:2,max:2} | disfluencies:true |
| 5 | review | auto | {min:2,max:2} | |
| 6 | balanced | auto | {min:2,max:2} | keyterms_prompt:["Romania"] |
| 7 | balanced | it | {min:2,max:2} | note: "enhanced audio" |
| 8 | balanced | it | {min:2,max:2} | note: "raw audio" |

Configs 7 and 8 use the same API params as config 3 — the difference is which audio file was uploaded (enhanced vs raw). The function will accept an optional `storage_path_raw` for config 8.

### Processing per config
1. Submit to AssemblyAI EU endpoint with the config's params
2. Poll until complete (5s intervals, 120 max)
3. Extract from the completed response:
   - All utterances overlapping 30–42s (wider window for context)
   - Word-level data in that window (text, confidence, speaker, start/end)
   - Whether "dalla Romania" or "vagomania" appears
   - Speaker labels and boundaries around the split point (~36.7s)
   - `language_code`, `speech_model`, overall `confidence`
4. Delete the AssemblyAI transcript immediately after extraction

### Output
A JSON report with:
```json
{
  "ground_truth": "dalla Romania",
  "target_window_ms": [34000, 38000],
  "results": [
    {
      "config_id": 1,
      "config_label": "balanced, auto, no speaker hint",
      "language_detected": "it",
      "speech_model": "...",
      "overall_confidence": 0.744,
      "window_utterances": [...],
      "window_words": [...],
      "contains_dalla_romania": false,
      "contains_vagomania": true,
      "speaker_split_at_36s": true,
      "unique_speakers_in_window": 2,
      "suspicious_span_avg_confidence": 0.50
    },
    ...
  ],
  "summary": {
    "best_for_phrase": 3,
    "best_for_speaker_split": 2,
    "best_overall_confidence": 3
  }
}
```

### Safety
- No product tables touched — purely reads from storage, calls AssemblyAI, returns JSON
- Deletes all AssemblyAI transcripts after extraction
- Long timeout needed (~15 min for 8 sequential runs) — will set function timeout accordingly
- Auth: requires service role or admin token (internal use only)

### Timeout handling
Each config takes ~60–90s to process. 8 configs = ~8–12 min total. The edge function will:
- Run configs sequentially (parallel would be faster but risks rate limits)
- Use a 900s (15 min) timeout via `supabase/config.toml`
- Return partial results if any config fails

### Files created
1. `supabase/functions/eval-transcribe/index.ts` — the evaluation harness
2. Update `supabase/config.toml` — add `[functions.eval-transcribe]` with `verify_jwt = false`

### Files NOT changed
- `supabase/functions/transcribe/index.ts` — untouched
- No UI files
- No schema changes

### How to run
After deploy, invoke via curl with the storage path to the regression audio file. The function returns the comparison report directly.

### Cleanup
After evaluation is complete and results are reviewed, the function can be deleted — it has no product dependencies.

