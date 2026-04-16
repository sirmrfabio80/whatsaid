
# eval-transcribe Pre-Flight Fixes

## Issues to fix

### 1. Wrong prompt parameter name (line 129)
AssemblyAI uses `prompt`, not `custom_prompt`. The production `transcribe` function uses the correct parameter name; the eval harness has a copy-paste error.

**Change:**
```typescript
// Line 129
body.prompt = config.prompt;  // was: body.custom_prompt
```

### 2. Missing speech_models configuration
Production uses `speech_models: ["universal-3-pro", "universal-2"]` for fallback. The eval harness omits this, so results won't match production behavior.

**Add after line 114:**
```typescript
speech_models: ["universal-3-pro", "universal-2"],
```

### 3. Wrong field name for model detection (line 300)
AssemblyAI returns `speech_model_used` (the actual model selected after fallback), not the legacy `speech_model` field.

**Changes:**
- Line 215 (interface): `speech_model_used: string | null;`
- Line 300 (extraction): `speech_model_used: (data.speech_model_used as string) || null,`
- Lines 374, 409 (error stubs): `speech_model_used: null,`

## Scope
Single file: `supabase/functions/eval-transcribe/index.ts`

Three targeted fixes to align eval behavior with production `transcribe/index.ts` configuration.

No architecture changes. No UI changes. No other edge functions touched.
