

## Plan: Dependency-aware disabled states in Transcribe settings (confirmed)

### Confirmation of dependency rule
Verified in `src/lib/audio-enhance.ts`: `max_gain_db_mono` and `max_gain_db_stereo` are read **only inside the normalisation stage** (line 201, gated by `if (opts.normalise && ...)` on line 207). They have zero effect when `audio_normalise === false` — the soft-clip limiter does not use them. **Original rule stands: disable both gain caps when normalisation is OFF.**

### Approach
Single helper `computeDisabled(value)` at the top of `TemplateEditor.tsx` returning a `DisabledMap` of `{ disabled, reason }` per dependent control. Threaded into existing `Field` / `ToggleField` / `Input` / `Textarea` / `Select` props. UI-only — never mutates stored values.

### Dependency rules

**Region routing**
- `us_base_url` — disabled when `geo_routing_enabled === false` → *"Geo-routing is OFF — all requests use the default base URL."*

**Prompting**
- `recovery_prompt` — disabled when `default_strategy !== "recovery"` → *"Active only when Default strategy is Recovery."*
- `review_prompt` — disabled when `default_strategy !== "review"` → *"Active only when Default strategy is Review."*
- `apply_prompt_on_diarization` — disabled when `default_strategy ∈ {"keyterms", "none"}` → *"No prose prompt configured — diarization-route policy has no effect."*

**Audio enhancement** (master OFF disables all; reasons cascade most-specific-wins)
- All sub-controls: master OFF → *"Audio enhancement is OFF — enable the master switch above to configure."*
- `audio_target_peak_dbfs` — also disabled when `audio_normalise === false` → *"Active only when normalisation is ON."*
- `audio_max_gain_db_mono` — disabled when `audio_normalise === false` → *"Active only when normalisation is ON."* OR when `apply_to_mono === false` → *"Apply-to-mono is OFF — this gain cap has no effect."* (mono-specific reason wins if both apply)
- `audio_max_gain_db_stereo` — mirror of above for stereo.
- `audio_normalise`, `audio_noise_floor_dbfs`, `audio_soft_clip_threshold`, `apply_to_mono`, `apply_to_stereo` — only depend on master.

### UI changes
1. Extend `Field` and `ToggleField` with optional `disabledReason?: string` rendered as a second muted hint line (italic, `text-xs text-muted-foreground/80`) when disabled.
2. Add `bg-muted/20` background tint on disabled `ToggleField` rows; rely on shadcn `disabled:opacity-50` for inputs. Labels keep full opacity for readability.
3. Stored values untouched — `computeDisabled` only flips the `disabled` prop. Re-enabling parent restores child immediately with previous value.

### Files to edit
- `src/components/admin/TemplateEditor.tsx` — add `computeDisabled` helper, extend `Field`/`ToggleField`, thread props through every dependent control.

### Out of scope
No changes to `transcribe-template.ts`, `audio-enhance.ts`, `Convert.tsx`, edge functions, payload, or job audit UI.

### Acceptance
- Master audio enhancement OFF → all 8 sub-controls disabled with master-switch reason; values preserved.
- `audio_normalise` OFF → target peak + both max-gain caps disabled with normalisation reason.
- `apply_to_mono` OFF → mono max-gain cap shows mono-specific reason (overrides normalisation reason); stereo unaffected.
- `apply_to_stereo` OFF → stereo max-gain cap shows stereo-specific reason; mono unaffected.
- Default strategy = `none` or `keyterms` → both prompt textareas + diarization toggle disabled with appropriate reasons.
- Default strategy = `recovery` → recovery textarea active; review textarea disabled with reason.
- Geo-routing OFF → US base URL disabled with reason.
- Re-enabling any parent restores child controls with stored values intact.
- Disabled controls remain readable.

