

# Expand Multilingual Speaker Name Detection — Revised Plan

## Scope

Speaker-name detection patterns only. No marketing/i18n copy changes. No Russian language patterns.

## Language tiers

| Tier | Languages | Coverage level |
|---|---|---|
| **1 — Full** | Italian, English, French | Extensive patterns, compound name+role extraction |
| **2 — Good** | Spanish, German, Portuguese | Strong explicit patterns + cautious broad patterns |
| **3 — Basic** | Dutch, Turkish, Polish, Romanian, Czech | Basic patterns only, conservative confidence |

## Pattern strength classification

**Strong explicit** (base confidence 0.90): patterns that unambiguously mean "my name is X"
- `mi chiamo X`, `my name is X`, `je m'appelle X`, `me llamo X`, `mein Name ist X`, `me chamo X`, `meu nome é X`, `mijn naam is X`, `adım X`, `mam na imię X`, `mă numesc X`, `jmenuji se X`

**Medium contextual** (base confidence 0.85): patterns with greeting/context that strongly imply naming
- `piacere, X`, `mi presento, sono X`, `hello/hi, this is X`, `X speaking`, `bonjour, je suis X`, `moi c'est X`, `hola, soy X`, `hier ist/spricht X`

**Broad "I am"** (base confidence 0.70 → always `suggested` or AI-reviewed): patterns like "I am X" that frequently match adjectives/roles
- `io sono X`, `I am X`, `I'm X`, `je suis X`, `soy X`, `ich bin X`, `eu sou X`, `ik ben X`, `ben X`, `jestem X`, `sunt X`, `jsem X`

## Expanded patterns by language

### Italian (Tier 1) — new additions
```
STRONG:   "mi chiamo X"              (already exists)
MEDIUM:   "mi presento, sono X"      /\bmi\s+presento[,\s]+sono\s+(\S+)/i
MEDIUM:   "piacere, X"               /\bpiacere[,\s]+(\S+)/i
MEDIUM:   "qui è X"                  /\bqui\s+è\s+(\S+)/i
MEDIUM:   "parlo io, X"              /\bparlo\s+io[,\s]+(\S+)/i
COMPOUND: "sono X della/del ..."     /\bsono\s+(\S+)\s+del(?:la|l')?\s+/i → name + org context
COMPOUND: "sono la dottoressa X"     handled by improved role-first pattern
COMPOUND: "sono l'infermiera X"      /\bsono\s+l[''](\S+)\s+(\S+)/i → elided article + role + name
BROAD:    "io sono X"                (already exists, downgrade to 0.70)
```

### English (Tier 1) — new additions
```
STRONG:   "my name is X"             (already exists)
MEDIUM:   "hello/hi, this is X"      /\b(?:hello|hi)[,\s]+this\s+is\s+(\S+)/i
MEDIUM:   "X speaking"               (already exists)
MEDIUM:   "speaking, X"              /\bspeaking[,\s]+(\S+)/i
COMPOUND: "this is Dr X"             /\bthis\s+is\s+(?:Dr\.?|Doctor)\s+(\S+)/i
COMPOUND: "I'm Dr X"                 /\bI(?:'m|\s+am)\s+(?:Dr\.?|Doctor)\s+(\S+)/i
COMPOUND: "I'm nurse X"             if first captured word is role → second is name
BROAD:    "I am X", "I'm X"          (already exist, downgrade to 0.70)
```

### French (Tier 1) — new additions
```
STRONG:   "je m'appelle X"           (already exists)
MEDIUM:   "bonjour, je suis X"       /\bbonjour[,\s]+je\s+suis\s+(\S+)/i
MEDIUM:   "moi c'est X"              /\bmoi\s+c['']est\s+(\S+)/i
MEDIUM:   "ici X"                    /\bici\s+(\S+)/i (start of utterance only)
MEDIUM:   "X à l'appareil"           /(\S+)\s+à\s+l['']appareil/i
COMPOUND: "je suis le/la [role] X"   /\bje\s+suis\s+(?:le|la)\s+(.+?)\s+([A-ZÀ-Ö]\S+)/i
COMPOUND: "je suis X, le/la [role]"  /\bje\s+suis\s+(\S+)[,\s]+(?:le|la)\s+(.+)/i
BROAD:    "je suis X"                (already exists, downgrade to 0.70)
```

### Spanish (Tier 2)
```
STRONG:   "me llamo X"               /\bme\s+llamo\s+(\S+)/i
STRONG:   "mi nombre es X"           /\bmi\s+nombre\s+es\s+(\S+)/i
MEDIUM:   "hola, soy X"              /\bhola[,\s]+soy\s+(\S+)/i
COMPOUND: "soy el/la [role] X"       /\bsoy\s+(?:el|la)\s+(.+?)\s+([A-ZÀ-Ö]\S+)/i
BROAD:    "soy X"                    /\bsoy\s+(\S+)/i → confidence 0.70
```

### German (Tier 2)
```
STRONG:   "mein Name ist X"          /\bmein\s+Name\s+ist\s+(\S+)/i
MEDIUM:   "hier ist X"               /\bhier\s+ist\s+(\S+)/i
MEDIUM:   "hier spricht X"           /\bhier\s+spricht\s+(\S+)/i
BROAD:    "ich bin X"                /\bich\s+bin\s+(\S+)/i → confidence 0.70
```

### Portuguese (Tier 2)
```
STRONG:   "me chamo X"               /\bme\s+chamo\s+(\S+)/i
STRONG:   "meu nome é X"             /\bmeu\s+nome\s+é\s+(\S+)/i
BROAD:    "eu sou X" / "sou o/a X"   /\beu?\s*sou\s+(?:o\s+|a\s+)?(\S+)/i → confidence 0.70
```

### Tier 3 (basic, all broad → 0.70)
```
Dutch:    "ik ben X"     /\bik\s+ben\s+(\S+)/i
          "mijn naam is X" /\bmijn\s+naam\s+is\s+(\S+)/i  (STRONG → 0.90)
Turkish:  "ben X"        /\bben\s+(\S+)/i
          "adım X"       /\badım\s+(\S+)/i  (STRONG → 0.90)
Polish:   "jestem X"     /\bjestem\s+(\S+)/i
          "mam na imię X" /\bmam\s+na\s+imię\s+(\S+)/i  (STRONG → 0.90)
Romanian: "sunt X"       /\bsunt\s+(\S+)/i
          "mă numesc X"  /\bmă\s+numesc\s+(\S+)/i  (STRONG → 0.90)
Czech:    "jsem X"       /\bjsem\s+(\S+)/i
          "jmenuji se X" /\bjmenuji\s+se\s+(\S+)/i  (STRONG → 0.90)
```

## Confidence tiers (revised)

| Pattern type | Base confidence | Default status |
|---|---|---|
| Compound (name + role) | 0.92 | `applied` if clean + capitalised |
| Strong explicit ("my name is") | 0.90 | `applied` if clean + capitalised |
| Medium contextual ("hello, this is") | 0.85 | `applied` if clean + capitalised |
| Broad "I am" | 0.70 | Always `suggested`. AI-reviewed if suspicious |

Broad patterns can never auto-apply — they always produce `suggested` status. Only AI confirmation can upgrade them to `applied`.

## ROLE_WORDS expansion

Add to both `identify-speakers/index.ts` and `src/lib/speaker-identification.ts`:
- Spanish: "enfermero", "enfermera", "terapeuta", "coordinador", "coordinadora", "directora"
- German: "arzt", "ärztin", "krankenschwester", "therapeut", "therapeutin", "direktor", "direktorin", "assistentin"
- Portuguese: "doutor", "doutora", "enfermeiro", "enfermeira", "terapeuta", "diretor", "diretora"

## Implementation approach

Refactor `extractSelfIdentification` to return a `patternStrength` field (`"strong" | "medium" | "broad" | "compound"`) alongside each candidate. The confidence scoring in `runDeterministicExtraction` uses this field to set the base confidence.

Auto-apply gate adds: `patternStrength !== "broad"` as a requirement.

## Test coverage

New file: `supabase/functions/identify-speakers/identify-speakers.test.ts`

**Positive cases** (name correctly extracted):
- IT: "io sono, sono Camilla" → Camilla, "mi chiamo Marco" → Marco, "piacere, Giulia" → Giulia, "sono la terapista occupazionale Camilla" → name: Camilla, role: terapista occupazionale, "mi presento, sono Luca" → Luca
- EN: "hello, this is Sarah" → Sarah, "my name is John" → John, "I'm Dr Smith" → name: Smith role: Dr, "Sarah speaking" → Sarah
- FR: "bonjour, je suis Marie" → Marie, "moi c'est Pierre" → Pierre, "je m'appelle Sophie" → Sophie
- ES: "me llamo Carlos" → Carlos, "hola, soy Ana" → Ana
- DE: "mein Name ist Anna" → Anna, "hier spricht Thomas" → Thomas
- PT: "me chamo João" → João

**Negative cases** (must NOT extract a name):
- "sono la terapista occupazionale" → no name (role only)
- "I'm the manager" → role-word, no name
- "je suis disponible" → stopword
- "sono contento" → stopword
- "soy el director" → role-word only

**Broad pattern cases** (must be `suggested`, not `applied`):
- "ich bin Thomas" → name: Thomas, status: suggested
- "soy Carlos" → name: Carlos, status: suggested
- "jestem Anna" → name: Anna, status: suggested

**Role extraction cases**:
- "sono Camilla, sono la terapista occupazionale" → name: Camilla, role: terapista occupazionale
- "I'm Dr Smith" → name: Smith, role: Dr
- "je suis le docteur Martin" → name: Martin, role: docteur

## Files changed

| File | Change |
|---|---|
| `supabase/functions/identify-speakers/index.ts` | Add `patternStrength` to Candidate, add all new patterns organised by tier, update confidence scoring to use strength tiers, add broad-pattern gate to auto-apply, expand ROLE_WORDS |
| `src/lib/speaker-identification.ts` | Expand ROLE_WORDS with ES/DE/PT terms |
| `supabase/functions/identify-speakers/identify-speakers.test.ts` | New Deno test file with all cases above |

## Regression risks

- **Broad over-matching**: Mitigated by 0.70 confidence cap and `suggested`-only status for all broad patterns
- **"piacere, X"**: Could grab non-name after greeting. Protected by stopword + role-word checks + capitalisation signal
- **Tier 3 short patterns** ("ben X" in Turkish): Very broad, but 0.70 confidence + suggested-only keeps it safe
- **Existing Italian fix preserved**: "io sono, sono Camilla" compound pattern is checked before the broad "io sono X" pattern

