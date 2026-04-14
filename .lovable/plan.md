

# `claim-transcript-share` Phase 2 — Copy Active-Language Variants

## Mapping strategy (tightened)

The current code inserts outputs in bulk (line 177–184) but does not return the new IDs. The fix:

1. Fetch old outputs with `id` included, ordered by `created_at` (deterministic insertion order).
2. Insert new outputs **one at a time in order**, collecting each new `id`.
3. Build an in-memory array of `{ oldId, newId }` pairs using positional correspondence — the Nth old output maps to the Nth new output.

This avoids relying on `(output_type, custom_prompt)` uniqueness entirely. The mapping is purely positional, driven by the same deterministic sort order on both sides.

For clarity:
- `transcript` and `summary` are unique by type, so positional mapping is trivially correct for them.
- Multiple `custom` outputs with identical prompts are handled safely because order is preserved.

## Changes to `claim-transcript-share/index.ts`

### 1. Fetch old outputs with `id`, ordered

```typescript
const { data: outputs } = await serviceClient
  .from('job_outputs')
  .select('id, output_type, content, custom_prompt')
  .eq('job_id', share.job_id)
  .order('created_at', { ascending: true })
```

### 2. Insert new outputs individually, build mapping

```typescript
const idMap: Array<{ oldId: string; newId: string }> = []
for (const o of outputs) {
  const { data: newOutput } = await serviceClient
    .from('job_outputs')
    .insert({
      job_id: newJob.id,
      output_type: o.output_type,
      content: o.content,
      custom_prompt: o.custom_prompt,
    })
    .select('id')
    .single()
  if (newOutput) {
    idMap.push({ oldId: o.id, newId: newOutput.id })
  }
}
```

### 3. Copy `output_language` to new job

Add `output_language: originalJob.output_language` to the job insert (line 137).

### 4. Copy active-language variants

If `originalJob.output_language` exists and differs from `originalJob.language_detected`:

```typescript
const activeLang = originalJob.output_language
if (activeLang && activeLang !== originalJob.language_detected) {
  const oldOutputIds = idMap.map(m => m.oldId)
  const { data: variants } = await serviceClient
    .from('job_output_variants')
    .select('job_output_id, language, content, source_hash')
    .in('job_output_id', oldOutputIds)
    .eq('language', activeLang)

  if (variants && variants.length > 0) {
    const variantInserts = variants
      .map(v => {
        const mapped = idMap.find(m => m.oldId === v.job_output_id)
        if (!mapped) return null
        return {
          job_output_id: mapped.newId,
          language: v.language,
          content: v.content,
          source_hash: v.source_hash,
        }
      })
      .filter(Boolean)

    if (variantInserts.length > 0) {
      await serviceClient.from('job_output_variants').insert(variantInserts)
    }
  }
}
```

## Files affected

| File | Change |
|---|---|
| `supabase/functions/claim-transcript-share/index.ts` | Ordered fetch, sequential insert with ID mapping, copy `output_language`, copy active variants |

## No migration needed

No schema changes — uses existing `job_output_variants` and `jobs.output_language`.

## Regression risks

| Risk | Mitigation |
|---|---|
| Sequential inserts slower than bulk | Typically 2–4 outputs per job; negligible latency |
| Variant `source_hash` mismatch after copy | Hash matches copied transcript content, so variants are fresh |
| `output_language` set but no variants exist | Frontend handles this — calls `regenerate` on next language switch |

