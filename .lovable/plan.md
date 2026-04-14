

# Fix Speaker Name Detection — Final Revised Plan

## Change from previous revision

**Capitalisation handling**: Lowercased names are never discarded. They are downgraded in confidence and routed to suggestion or AI review, not rejected. Capitalisation remains a positive signal for auto-apply but its absence is not grounds for rejection.

## Architecture

```text
Transcript lines
      │
      ▼
┌─────────────────────┐
│ Deterministic regex  │  ← improved patterns
│ extraction (fast)    │
└─────────┬───────────┘
          │ candidates
          ▼
┌─────────────────────┐
│ Semantic validation  │  ← NEW layer
│ (role-word block,    │
│  suspicious check)   │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │           │
  CLEAN      SUSPICIOUS
    │           │
    ▼           ▼
 Auto-apply   Escalate to AI
 (≥0.85)      (gemini-2.5-flash)
```

## 1. Regex improvements

Add compound patterns checked first (most specific):

- **Italian compound**: `/\bsono\s+([A-ZÀ-Öa-zà-ö]\S+),?\s+sono\s+(?:il|la)\s+(.+)/i` → name + role
- **Italian repetition**: `/\bio\s+sono[,\s]+sono\s+(\S+)/i` → name after repeated "sono"
- **Italian role-first**: `/\bsono\s+(?:il|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö][a-zà-ö]+)\s*[,.]?\s*$/i` → role + trailing name

Existing pattern fixes:
- All captured names run through `cleanName` and role-word blocklist
- Allow both capitalised and lowercased captures (don't require uppercase first char in regex)

## 2. Semantic validation layer

`ROLE_WORDS` blocklist: "terapista", "occupazionale", "dottore", "dottoressa", "infermiere", "assistente", "coordinatore", "fisioterapista", "logopedista", "doctor", "nurse", "therapist", "manager", "director", "thérapeute", etc.

Validation rules:

| Check | Result |
|---|---|
| Name in `ROLE_WORDS` | `suspicious` — escalate to AI |
| Name in `STOPWORDS` | `rejected` |
| Name length < 2 | `rejected` |
| Name > 15 chars or contains spaces | `suspicious` |
| Name is lowercased | Downgrade confidence by 0.10, but keep as valid candidate. Route to `suggested` (not auto-apply) unless AI confirms |

## 3. Escalation rules (AI runs only when)

1. Semantic validation returns `"suspicious"`
2. Multiple conflicting names for same speaker
3. Same name claimed by multiple speakers
4. Confidence after validation < 0.80
5. Name is lowercased (not auto-apply, but eligible for AI confirmation)

Model: `google/gemini-2.5-flash` (only for escalated cases)

Improved prompt instructs AI to extract person names (not role words), put roles in the `role` field, and handle messy speech.

## 4. Auto-apply rules (ALL must be true)

1. Semantic validation returns `"clean"`
2. Single consistent name (no conflicts)
3. No cross-speaker conflict
4. Name is capitalised
5. Confidence ≥ 0.85
6. Name not in `ROLE_WORDS`

Otherwise → `"suggested"` (banner for user confirmation)

## 5. Confidence scoring

| Scenario | Confidence |
|---|---|
| Compound pattern, name + role | 0.92 |
| Simple self-ID, capitalised, clean | 0.90 |
| Simple self-ID, lowercased | 0.80 (→ suggested, eligible for AI review) |
| Multiple utterances same name | +0.03 (cap 0.95) |
| Cross-speaker conflict | cap 0.50 |
| Suspicious validation | cap 0.60, escalate |
| AI-confirmed | use AI confidence (cap 0.95) |

## Files changed

| File | Change |
|---|---|
| `supabase/functions/identify-speakers/index.ts` | Compound regex, `ROLE_WORDS` blocklist, `validateCandidate()`, updated auto-apply/escalation logic, upgraded AI model + prompt |
| `src/lib/speaker-identification.ts` | Export `ROLE_WORDS` for client-side consistency |

No migration needed.

