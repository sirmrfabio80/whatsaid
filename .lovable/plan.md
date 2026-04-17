

## Plan: RMS-target normalisation (4× louder) + audio comparison tooling

### Root cause (no code change needed to diagnose)
Current `enhanceAudioForTranscription` is **peak-normalising**: `gain = target_peak / input_peak`. Your file had peak=−0.45 dB, target=−1 dB → ratio < 1 → gain capped at 0 dB. RMS stayed at −12 dB. Raising `max_gain_db_mono` does nothing here because the limiter is the peak ceiling, not the cap.

### Fix: switch to RMS-target with aggressive soft-clip safety

In `src/lib/audio-enhance.ts`, add a new normalisation mode (keeping peak mode as fallback):

1. **New option** `normalise_mode: "peak" | "rms"` (default `"rms"`).
2. **New option** `target_rms_dbfs` (default **−16 dBFS** — broadcast/podcast standard, ~4× louder than your −12 dB measurement when combined with peak hot files; for your specific file it will lift +12 dB and rely on soft-clip for transients).

   Wait — your input is already −12 RMS. Target −16 would *lower* it. Correct direction: **target_rms_dbfs = −9** (≈ +3 dB) is gentle; for "4× louder" we want ~+12 dB which lands at **target_rms_dbfs ≈ 0** — too hot. Sweet spot for speech-on-phone: **target_rms_dbfs = −14**, with the cap raised. Actually for *your* file (−12 RMS, −0.45 peak), +12 dB makes RMS = 0 dBFS which clips violently.

   **Realistic "4× perceived louder" for already-hot files**: lift by **+9 to +12 dB** and let the soft-clip tanh curve absorb the peaks. Set:
   - `target_rms_dbfs = -3` (very loud target)
   - `max_gain_db_mono = 14`, `max_gain_db_stereo = 12` (cap so quiet files don't explode)
   - `soft_clip_threshold = 0.85` (more aggressive than current 0.95 — needed because RMS-target deliberately pushes peaks past the ceiling)

3. **Algorithm change** in the normalisation stage:
   ```
   if mode == "rms":
     desired_gain = target_rms_linear / input_rms
   else:
     desired_gain = target_peak_linear / input_peak
   gain = min(desired_gain, max_gain_linear)
   apply gain
   then re-run soft-clip (already exists) — now it's the real safety net
   ```
   Move the soft-clip pass to run **after** gain so it actually catches the boosted peaks. Currently it runs before gain, which is why peaks survive.

4. **Metadata additions** to `AudioEnhanceMeasured`:
   - `output_rms_dbfs` (post-gain, pre-clip)
   - `output_peak_dbfs` (post-clip)
   - `soft_clip_samples_pct` (% of samples the limiter touched — visible in Logs so admins see when it's working hard)

5. **Admin defaults update** in `src/lib/transcribe-template.ts`:
   - `audio_normalise_mode: "rms"`
   - `audio_target_rms_dbfs: -3`
   - `audio_target_peak_dbfs: -1` (still the soft-clip ceiling)
   - `audio_max_gain_db_mono: 14` (down from 18 — RMS mode needs less headroom)
   - `audio_max_gain_db_stereo: 12`
   - `audio_soft_clip_threshold: 0.85`

6. **Admin UI** (`TemplateEditor.tsx`):
   - Add a `Select` for **Normalisation mode** (Peak / RMS) with helper text explaining RMS lifts loudness even when peaks are already at the ceiling.
   - Add **Target RMS (dBFS)** number input, disabled when mode = peak (using existing `disabledReason` pattern).
   - Update **Target peak** helper to read "Soft-clip ceiling — peaks above this are limited" when mode = RMS.

7. **Logs UI** (`JobAuditCard.tsx` `AudioEnhancementAudit`):
   - Render output RMS/peak alongside input.
   - Show soft-clip % as a small pill (green <1%, amber 1–10%, red >10%).

### Why I can't decode your two files in plan mode
Plan mode is read-only — no `code--exec`, so I can't run `ffmpeg`/Python to compute RMS/peak/LUFS on the actual WAV samples. **In implementation mode I will**:
- Copy both files to `/tmp/`, run a Python script (numpy + scipy.io.wavfile) to compute input RMS, peak, LUFS, and sample-by-sample diff between original and your normalised version.
- Report measured loudness ratio (e.g. "your normalised file is +6.3 dB louder RMS, +0.2 dB peak").
- Adjust the proposed `target_rms_dbfs` default if the measurement disagrees with the −12 dB / −0.45 dB earlier audit.

### Files to edit
- `src/lib/audio-enhance.ts` — add RMS mode, reorder soft-clip-after-gain, extend metadata.
- `src/lib/transcribe-template.ts` — new fields + defaults.
- `src/components/admin/TemplateEditor.tsx` — mode selector, target RMS input, dependency wiring.
- `src/components/admin/JobAuditCard.tsx` — render output RMS/peak + soft-clip %.
- `supabase/functions/transcribe/index.ts` — pass new fields through to `audio_enhancement` log object (no payload change to AssemblyAI).
- `src/components/AudioUploader.tsx` (if it consumes `AudioEnhanceOptions`) — pass through new fields.

### Out of scope
- AssemblyAI request payload unchanged.
- No backend model/provider changes.

### Acceptance
- Re-uploading the same Fatebenefratelli file with defaults produces a job whose `audio_enhancement.measured` shows `applied_gain_db ≈ +9 to +12`, `output_rms_dbfs ≈ −3 to 0`, `soft_clip_samples_pct < 5%`.
- Logs tab shows input vs output RMS/peak side-by-side.
- Switching mode to "Peak" in admin restores old behaviour exactly.
- Quiet files (RMS < −30) still hit the gain cap and don't get blown out (cap = 14 dB).

