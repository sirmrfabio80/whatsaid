

## Plan: Surface `language_code` in transcribe logs

### Diagnosis
The language selection IS being sent to AssemblyAI correctly. I verified in the database that the most recent job (`2c8cd47f...`, file "Villa Ida — pre video chiamata.m4a") has:
- `language_selected = "it"` (user picked Italian)
- `transcription_config.language_code = "it"` (edge function set it on the payload)
- `transcription_config.language_detection = false` (correctly skipped)

The edge function code at `supabase/functions/transcribe/index.ts:448-453` is correct:
```
if (job.language_selected && job.language_selected !== "auto") {
  payload.language_code = job.language_selected;
} else if (cfg.language_detection) {
  payload.language_detection = true;
  ...
}
```

### Real bug: observability gap
The `transcription_routing` and `transcription_completed` log lines do NOT include `language_code` at all. They only log `language_confidence_threshold`. So when reading edge function logs, it looks like no language was forced — which is what triggered this report.

Recent log line confirms the gap:
```
{"event":"transcription_routing", ..., "language_confidence_threshold":null, ...}
```
No `language_code` key, no `language_detection` key.

### Fix
In `supabase/functions/transcribe/index.ts`:

1. **`transcription_routing` log** (~line 505) — add:
   - `language_code: transcriptPayload.language_code ?? null`
   - `language_detection: transcriptPayload.language_detection ?? false`
   - `language_selected_by_user: job.language_selected ?? null` (so we see exactly what the user chose vs what was sent)

2. **`transcription_completed` log** (~line 590) — add:
   - `language_code_requested: transcriptPayload.language_code ?? null`
   - `language_detection_requested: transcriptPayload.language_detection ?? false`
   - Keep existing `language_detected` (what AssemblyAI returned)

This makes it trivial to audit per-job whether the user's language override was honored.

### File to edit
- `supabase/functions/transcribe/index.ts` — extend two log lines

### Acceptance
- For a job where the user picks Italian, the `transcription_routing` log shows `"language_code":"it","language_detection":false,"language_selected_by_user":"it"`.
- For a job where the user leaves Auto, it shows `"language_code":null,"language_detection":true,"language_selected_by_user":"auto"`.
- No payload behavior changes — pure observability fix.

