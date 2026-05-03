## Problem

The `detect-language` edge function fails with HTTP 400 from AssemblyAI:

```
"speech_models" must be a non-empty list containing one or more of: "universal-3-pro", "universal-2"
```

We previously switched from the deprecated `speech_model: "nano"` string to `speech_models: ["nano"]`. But on the AssemblyAI **EU** endpoint (`api.eu.assemblyai.com`), the `speech_models` array only accepts `"universal-3-pro"` or `"universal-2"` — `"nano"` is not a valid member there. So every detection submit returns 400, the UI shows "Language detection unavailable", and the flow falls back to auto-detect during full transcription.

This is why the warning appears on **every** recording, regardless of length or content (Noise_party.m4a, Vicki - Financial advisor.m4a, etc).

## Fix

### 1. `supabase/functions/detect-language/index.ts`
Replace the invalid `speech_models: ["nano"]` with a valid EU value. Use:

```ts
speech_models: ["universal-2"],
```

`universal-2` is the lightweight option available on EU and is appropriate for a fast 30–90s language-detection pre-pass. (`universal-3-pro` is heavier and slower — overkill for a preview.) We keep `audio_end_at`, `language_detection: true`, and the existing polling/timeout logic.

### 2. Verify against the main `transcribe` function
Quickly read `supabase/functions/transcribe/index.ts` to confirm the full transcription job is not making the same mistake. If it also passes an invalid `speech_models` value on EU, fix it the same way; otherwise leave it alone.

### 3. Redeploy
Deploy `detect-language` (and `transcribe` if touched) so the next recording exercises the fix.

### 4. No UI / schema / i18n changes needed
The existing status pill + reason line already surface whatever the function returns — once detection succeeds, the warning will simply stop appearing. The diagnostics column added previously stays as-is.

## Verification

After deploy:
- Record a short clip → detection should return `status: "success"` with a language code, no warning banner.
- Check `detect-language` edge logs: no more `[400] speech_models` errors.

## Out of scope

- No changes to the credit model, upload pipeline, or History deletion confirmation.
- No changes to the language gate UX.
