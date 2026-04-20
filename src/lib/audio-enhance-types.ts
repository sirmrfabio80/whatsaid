/**
 * Shared types between the main thread (`audio-enhance.ts`) and the
 * Web Worker (`audio-enhance.worker.ts`). Kept in a separate module so the
 * worker can import them without pulling in DOM-only dependencies.
 */

export type NormaliseMode = "peak" | "rms";

export interface AudioEnhanceOptions {
  normalise: boolean;
  normalise_mode: NormaliseMode;
  target_peak_dbfs: number;
  target_rms_dbfs: number;
  max_gain_db_mono: number;
  max_gain_db_stereo: number;
  noise_floor_dbfs: number;
  soft_clip_threshold: number;
}

export interface AudioEnhanceMeasured {
  input_rms_dbfs: number;
  input_peak_dbfs: number;
  applied_gain_db: number;
  output_rms_dbfs: number;
  output_peak_dbfs: number;
  soft_clip_samples_pct: number;
  normalise_mode: NormaliseMode;
}
