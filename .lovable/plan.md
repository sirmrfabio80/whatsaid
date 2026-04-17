

## Plan: Audio enhancement controls + visibility (revised)

### What's true today (audit)
- `enhanceAudioForTranscription` runs **only for stereo** uploads (`Convert.tsx:222`); mono is skipped to protect diarization. Hardcoded constants: noise gate −50 dBFS, target peak −1 dBFS, max gain +18 dB mono / +12 dB stereo, soft-clip 0.95.
- The `enhanceAudio` switch in `TranscriptionSettings.tsx` is dead UI — that component is not mounted anywhere.
- `transcription_config.audio_enhanced: true` is currently written on every job, even when skipped — meaningless.
- Admin template has zero audio-enhancement fields. Edge logs say nothing about it.

### Fix in 4 parts (matching your numbered points)

**1) When it triggers — make it explicit in Admin**
Add an "Audio enhancement" section to `TemplateEditor.tsx` (and `TranscribeTemplateConfig`) that controls the trigger rules:
- `audio_enhancement_enabled` (bool, default true) — master switch
- `audio_enhancement_apply_to_mono` (bool, default false)
- `audio_enhancement_apply_to_stereo` (bool, default true)
- Hint text under each: "Runs in the browser before upload. Mono recordings are skipped by default because client-side normalisation can collapse AssemblyAI's diarizer on quiet single-mic audio."

`Convert.tsx` reads the active template and gates enhancement on these flags instead of the hardcoded `if (isMono)`.

**2) Show whether it's enabled**
Source of truth = the Admin section above. Also add a small read-only summary at the top of the Transcribe settings tab, e.g. *"Audio enhancement: enabled — stereo only"*. Label is **"Audio enhancement"** everywhere — never phrased as if normalisation/boost always run.

**3) Edit normalisation + volume boost**
Extend `TranscribeTemplateConfig` with editable knobs (defaults match today's constants):
- `audio_normalise` (bool, default true) — when false, skip peak-normalise stage entirely (only soft-clip safety remains)
- `audio_target_peak_dbfs` (number, default −1)
- `audio_max_gain_db_mono` (number, default 18)
- `audio_max_gain_db_stereo` (number, default 12)
- `audio_noise_floor_dbfs` (number, default −50)
- `audio_soft_clip_threshold` (number, default 0.95, range 0.5–1.0)

UI: numeric inputs with units ("dBFS", "dB"), validation, hint text per field. `enhanceAudioForTranscription` gets an optional `options` param accepting these knobs (no breaking change). `Convert.tsx` passes the loaded template values in.

**4) Per-job runtime metadata + log**
`audio-enhance.ts` returns `{ file, metadata }`. `Convert.tsx` writes a structured `audio_enhancement` object into `transcription_config` — replacing the old `audio_enhanced` boolean. Strict shape:

```
audio_enhancement: {
  eligible: boolean,             // template flags allow it for this channel layout
  attempted: boolean,            // we actually called the enhancer
  applied: boolean,              // enhancer modified samples (false if noise-gated, failed, or normalise=false and no clipping needed)
  reason: "applied"
        | "stereo_disabled_by_template"
        | "mono_disabled_by_template"
        | "feature_disabled_by_template"
        | "noise_gated"
        | "below_normalise_threshold"
        | "failed",
  input_channels: 1 | 2,
  duration_ms: number,           // wall-clock time spent in enhancer (0 if not attempted)
  settings_snapshot: {
    normalise, target_peak_dbfs,
    max_gain_db_mono, max_gain_db_stereo,
    noise_floor_dbfs, soft_clip_threshold
  } | null,                      // null if not attempted
  measured: {
    input_rms_dbfs, input_peak_dbfs, applied_gain_db
  } | null                       // null if not applied
}
```

Rule: never describe runtime behaviour by `applied` alone. UI/logs always read the `eligible → attempted → applied (+reason)` triple.

`supabase/functions/transcribe/index.ts`: include `audio_enhancement` in `transcription_routing` and `transcription_completed` log events (pass-through from `job.transcription_config?.audio_enhancement ?? null`).

`LogsTab` / `JobAuditCard` already render the full `transcription_config` JSON, so the per-job audit is automatic. Add one small helper line in `JobAuditCard.tsx` that summarises the triple in plain English (e.g. "Eligible, attempted, applied (+8.2 dB)" or "Eligible, attempted, not applied — noise_gated") and tolerates the legacy `audio_enhanced: true` shape.

### Dead UI cleanup
Delete `src/components/TranscriptionSettings.tsx` now. It is not imported anywhere (verified: no mounts in `Convert.tsx` or elsewhere). The new template-driven flow supersedes it. Removing avoids future confusion.

### Files to edit
- `src/lib/transcribe-template.ts` — extend `TranscribeTemplateConfig`, defaults, `parseTemplateConfig`, `configsEqual`
- `src/components/admin/TemplateEditor.tsx` — add "Audio enhancement" section (master switch + mono/stereo + 6 knobs)
- `src/components/admin/TranscribeTemplatesTab.tsx` — read-only summary line at top
- `src/components/admin/JobAuditCard.tsx` — plain-English `eligible/attempted/applied` summary, legacy-tolerant
- `src/lib/audio-enhance.ts` — accept options, return `{ file, metadata }`, honor knobs
- `src/pages/Convert.tsx` — load template, gate on flags, write structured `audio_enhancement` (drop `audio_enhanced`)
- `supabase/functions/transcribe/index.ts` — include `audio_enhancement` in two log lines
- DELETE `src/components/TranscriptionSettings.tsx`

### Out of scope
Server-side audio processing (still browser-side).

### Acceptance
- Admin → Transcribe settings shows "Audio enhancement" section with master switch, mono/stereo toggles, and 6 numeric knobs. Saving persists into template `config` JSON.
- Top-of-tab summary reads e.g. "Audio enhancement: enabled — stereo only". Label never implies normalisation/boost always run.
- Stereo upload with `audio_normalise=false` → job has `audio_enhancement.eligible=true, attempted=true, applied=true, settings_snapshot.normalise=false`.
- Mono upload with `apply_to_mono=true` actually runs the enhancer (today it never does).
- Mono upload with `apply_to_mono=false` → `eligible=false, attempted=false, applied=false, reason="mono_disabled_by_template"`.
- `transcription_routing` log line for that job contains the same `audio_enhancement` object.
- Old jobs with legacy `audio_enhanced: true` still load in Logs tab without errors.
- `TranscriptionSettings.tsx` no longer exists in the repo; no import errors.

