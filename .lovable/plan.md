

# Fix: Missing Italian "sono X" Speaker Identification Patterns

## Root cause

Two regex gaps in `supabase/functions/identify-speakers/index.ts`:

1. **No compound pattern for "sono [Name] la/il [Role]"** — the name-first word order used in natural Italian ("sono Martina la logopedista"). Existing patterns only handle the reverse: "sono il/la [role] [Name]".

2. **No broad pattern for bare "sono X"** without "io". Italian is a pro-drop language — speakers routinely omit the subject pronoun. The existing `\bio\s+sono\s+(\S+)` pattern requires the explicit "io", missing most real-world self-introductions.

## File to change

`supabase/functions/identify-speakers/index.ts` — `extractCompoundPatterns()` and `extractSelfIdentification()` functions only.

## Changes

### 1. Add compound pattern: "sono [Name] la/il [Role]" (name-first)

Insert in `extractCompoundPatterns()` (after line ~166, before the elided-article pattern):

```typescript
// Italian: "sono X la/il [role]" — name first, role after (e.g. "sono Martina la logopedista")
m = t.match(/\bsono\s+([A-ZÀ-Ö][a-zà-ö]+)\s+(?:il|la)\s+(\S+)/i);
if (m) {
  const namePart = cleanName(m[1]);
  const rolePart = cleanName(m[2]);
  if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
    return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }
}
```

This explicitly checks that the word after "la/il" is a known `ROLE_WORD`, ensuring we don't misfire on non-role phrases. With the input text, it matches `sono (Martina) la (logopedista)` — "logopedista" is in the `ROLE_WORDS` set.

### 2. Add broad pattern: bare "sono X" (without "io")

Insert in `extractSelfIdentification()` broad section (after the "io sono X" pattern at line ~359):

```typescript
// Italian: "sono X" (without explicit "io" — pro-drop)
m = t.match(/\bsono\s+([A-ZÀ-Ö][a-zà-ö]+)/);
if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }
```

This requires the name to start with a capital letter (case-sensitive regex, no `i` flag) to avoid false positives on phrases like "sono contenta". Combined with `isValidName()` filtering out stopwords and role words, this is safe as a broad/suggested pattern.

### Why this order matters

The compound pattern is checked first (in `extractCompoundPatterns`). So "sono Martina la logopedista" will match as a **compound** hit with high confidence and the role captured. If the text were just "sono Martina" without a role, it would fall through to the **broad** pattern and be suggested rather than auto-applied.

## Expected result for the failing text

- Pattern matched: compound `sono (Martina) la (logopedista)`
- Name: "Martina"
- Role: "logopedista"
- Confidence: high (compound pattern)
- Status: applied (capitalised + compound)

## Scope

- One edge function file only
- No UI, API, or database changes
- No changes to confidence scoring, validation, or AI fallback logic

