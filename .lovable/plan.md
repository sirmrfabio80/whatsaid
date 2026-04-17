

## Plan: Smarter self-id regex + role-only suggestions (revised)

### Feedback applied
1. **"sono Martina" alone is enough** — no punctuation gate, no capital gate. Italian transcripts are unreliable for case.
2. **Roles are valid suggestions** — when a speaker says "sono un fisiatra" / "sono il fisioterapista" / "sono in fisioterapista", suggest the role as the label, ignoring articles ("il", "la", "un", "una", "lo", "gli", "in", "a", "l'").
3. **No cross-speaker role dedupe** — if two speakers are both "fisiatra", suggest "Fisiatra" for both. Stupid to silence one.
4. **Name + role together** → label = `Martina (logopedista)`.

### Changes — `supabase/functions/identify-speakers/index.ts`

**A. Compound name + role (case-insensitive, comma-tolerant)**
```
/\bsono\s+([a-zà-öA-ZÀ-Ö]{2,})(?:\s*,)?\s*(?:il|la|l['\u2019]|un|una|lo|gli)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i
```
- Capture 1 must pass `validateCandidate` (not in STOPWORDS / ROLE_WORDS / NON_NAME_PATTERNS / not an article). If capture 1 is in ROLE_WORDS → fall through to rule C.
- Capture 2 cleaned of trailing punctuation; if in ROLE_WORDS → use as role.
- `inferred_name = capitalise(name)`, `role = lowercase(role)`, label rendered as `Martina (logopedista)` in the banner. Confidence 0.92.
- Equivalents for EN (`I'm/I am`), ES (`soy`), FR (`je suis`), DE (`ich bin`), PT (`(eu) sou`), NL (`ik ben`).

**B. Name-only self-id (no punctuation/capital gate)**
- IT: `/\bsono\s+([a-zà-öA-ZÀ-Ö]{2,})\b/i`
- Same shape for EN/ES/FR/DE/PT/NL.
- Reject token if: STOPWORDS, ROLE_WORDS (→ rule C), NON_NAME_PATTERNS, or article ("un/una/il/la/lo/gli/l'/in/a/the/an/der/die/das/le/la/un/une/o/a/de"). Confidence 0.88.

**C. Role-only self-id (NEW)**
- IT: `/\bsono\s+(?:il|la|l['\u2019]|un|una|lo|gli|in|a)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i`
- If capture is in ROLE_WORDS → suggest with `inferred_name = capitalise(role)`, `role = role`, confidence 0.75, source `deterministic`.
- **No cross-speaker dedupe** — multiple "Fisiatra" allowed.
- Equivalents for EN/ES/FR/DE/PT/NL.

**D. Priority per speaker**
For each speaker, evaluate utterances in order, keep the highest-confidence match:
A (0.92) > B (0.88) > C (0.75). A speaker who already has a name in `speaker_names` is skipped entirely. Suggestions for a speaker that already has any A/B match drop the C role-only result.

**E. Banner label rendering** — `src/components/SpeakerIdentificationBanner.tsx`
- If suggestion has both `inferred_name` and `role` → render `Martina (logopedista)`.
- If role-only (name === capitalised role) → render `Fisiatra` with small subtitle "role detected, no name".

### Changes — `supabase/functions/transcribe/index.ts`
Add `stripInlineLanguageTags(text)` covering all UI/AssemblyAI languages (italian/english/french/spanish/german/portuguese/dutch/polish/romanian/czech/russian/chinese/japanese/korean/arabic/turkish/hindi/swedish/norwegian/danish/finnish/greek/hebrew/hungarian/ukrainian/catalan/galician/indonesian/malay/thai/vietnamese + native names). Apply to every utterance text in both multichannel and diarization branches before building `transcriptText`. Log `inline_language_tags_stripped` count when >0. Raw `transcript.utterances` left untouched.

### Migration
Delete cached `speaker_identifications` row for job `ac4a1e43-6b27-4f2a-83a2-ba78c5030814` so new rules run on next view.

### Tests — `supabase/functions/identify-speakers/identify-speakers.test.ts`
- "Sono Martina, la logopedista." → name=Martina, role=logopedista (0.92)
- "sono martina" (lowercase, no punct) → Martina (0.88)
- "sono pronto" → no suggestion (stopword)
- "sono un fisiatra" → role-only Fisiatra (0.75)
- "sono il fisioterapista" → role-only Fisioterapista (0.75)
- "adesso sono in fisioterapista" → role-only Fisioterapista (0.75)
- Two speakers both saying "sono un fisiatra" → both get Fisiatra suggestion (no dedupe)
- "I'm Sarah, the nurse" → Sarah + nurse

### Files to edit
- `supabase/functions/identify-speakers/index.ts`
- `supabase/functions/identify-speakers/identify-speakers.test.ts`
- `supabase/functions/transcribe/index.ts`
- `src/components/SpeakerIdentificationBanner.tsx`
- New migration deleting the cached row

### Acceptance — job `ac4a1e43-…` after re-scan
- Speaker A: Camilla (unchanged, already named)
- Speaker B ("sono pronto"): no suggestion
- Speaker C ("sono un fisiatra"): **Fisiatra**
- Speaker D ("Sono Martina, la logopedista. Vi racconto..."): **Martina (logopedista)**
- Speaker G ("adesso sono in fisioterapista"): **Fisioterapista**

