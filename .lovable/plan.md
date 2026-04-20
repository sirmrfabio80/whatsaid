

## Simplify Convert page step labels

Hide the technical worker substages (Decoding / Processing samples / Encoding MP3) from end users and merge the early "Preparing audio" phase into a single friendly **"Enhancing audio…"** step. Audio enhancement still runs exactly as today — only the wording shown to the user changes.

### Final step list shown to users

1. **Enhancing audio…** (covers preparing + worker decode/process/encode)
2. **Uploading audio…**
3. **Transcribing with speaker labels…**
4. **Generating summary & analysis…**
5. **Processing complete**

### Changes

**`src/pages/Convert.tsx`**
- In `STEP_LABELS`, replace the `enhancing` branch that switches on `enhanceSubstage` with a single label: `t("convert.stepEnhancing")`. Keep the `EnhanceSubstage` state wired for telemetry but stop using it to change the visible label.
- In the `STEP_ORDER` array used to render the checklist, remove the standalone `"preparing"` entry so the visible list starts at `enhancing`. Keep `"preparing"` in the `ProcessingStep` union (the DB `processing_stage` still uses it).
- In the poller (lines ~109–115) and the local pipeline (lines ~217, ~347), when the local stage is `preparing` set the visible `step` to `"enhancing"` instead of `"preparing"`. The job row still writes `processing_stage: "preparing"` to the DB unchanged.
- Initial `setStep("preparing")` on Convert click becomes `setStep("enhancing")`.

**i18n locales (`en.json`, `fr.json`, `it.json`)**
- Remove `stepEnhancingDecoding`, `stepEnhancingProcessing`, `stepEnhancingEncoding`, and `stepPreparing` keys (no longer referenced).
- Keep `stepEnhancing` as the single label:
  - EN: "Enhancing audio…"
  - FR: "Amélioration de l'audio…"
  - IT: "Miglioramento audio…"
- Keep `longFileToast` as is.

### Out of scope
- No change to the worker, the streaming wrapper, or the DB `processing_stage` values — enhancement still runs identically.
- No change to backend, watchdog, or transcribe heartbeat.
- No change to the toast or any other copy.

### Validation
- Re-upload the 41-min M4A: user sees "Enhancing audio…" continuously through the entire local pipeline (no flicker between Preparing/Decoding/Processing/Encoding), then "Uploading audio…", then transcription steps. No reference to "MP3" or "Encoding" appears in the UI.
- Short M4A: same simplified flow, no regression.
- French and Italian locales show the translated single label.

