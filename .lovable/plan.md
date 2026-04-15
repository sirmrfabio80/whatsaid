

# Speaker Suggestion Feature: Audit & Rebuild Plan

## 1. Root Cause Analysis

The core bug is in the **"broad" pattern tier** (lines 385–441 of `identify-speakers/index.ts`). These patterns match any word following common verbs:

- `sono X` (Italian) — matches "sono **Strutturati**", "sono **che**", "sono **contento**"
- `io sono X`, `I am X`, `je suis X`, `ich bin X`, etc.

In Italian, "sono" means both "I am" (first person) and "they are" (third person), making `\bsono\s+([A-ZÀ-Ö][a-zà-ö]+)/` catastrophically over-eager. Any capitalised word at sentence start after "sono" gets captured as a name.

The stopword list covers ~80 words but misses thousands of common Italian words (articles, conjunctions, adjectives, past participles, verbs, etc.). "Che", "Strutturati", "Tutti", "Questo", "Quello", "Appena" — none are in the stopword list but none are names.

**Secondary issues:**
- The AI review layer (lines 560–663) receives already-bad candidates and often confirms them because the prompt says "determine the correct person name" — biasing the model toward finding a name even when none exists
- Broad-tier confidence starts at 0.70, which passes the 0.50 final threshold
- No language-aware validation — the system doesn't know the transcript language, so it can't apply language-specific word-class filtering
- No proper-noun plausibility check — any capitalised word passes `isValidName()` if it's not in the tiny stopword/role sets

## 2. Recommendation: **Option A — Conservative Rebuild**

Rebuild the feature with strict evidence requirements. The deterministic pattern-matching architecture is fundamentally sound for compound and strong patterns (explicit self-introductions like "mi chiamo Marco", "my name is Sarah"). These are high-signal, low-risk. The problem is exclusively in the broad tier and the insufficient validation layer.

## 3. Acceptance Criteria

1. **No suggestion unless explicit self-introduction evidence exists** — patterns like "mi chiamo X", "my name is X", "I'm X, the [role]" are valid; patterns like "sono X", "I am X" alone are NOT valid
2. **Broad pattern tier is removed entirely** — only compound, strong, and medium tiers remain
3. **A proper-noun plausibility gate rejects common words** — using a combination of: (a) expanded multilingual stopword list (~500+ words covering articles, conjunctions, prepositions, common adjectives, common verbs, past participles), (b) minimum 3 characters for single-word names, (c) rejection of words that are lowercase in the original transcript
4. **Confidence floor raised to 0.75** for any suggestion to be shown (up from 0.50)
5. **Nothing is ever auto-applied** — all identifications are "suggested" status, requiring explicit user acceptance
6. **AI review prompt is rewritten** to be sceptical by default: "If no clear person name is present, return confidence 0.0. Do NOT infer or guess names."
7. **Transcript language is passed** to the edge function and used in the AI review prompt for language-aware validation
8. **Zero false positives on Italian transcripts** that contain no self-introductions

## 4. Exact Product/UI Changes

### Backend — `supabase/functions/identify-speakers/index.ts`
- **Delete** the entire broad pattern section (lines 385–441)
- **Expand** STOPWORDS to ~500+ entries covering Italian/English/French/Spanish/German common words (articles, conjunctions, prepositions, common adjectives, verbs, adverbs, pronouns, past participles)
- **Add** a `COMMON_WORDS` blocklist for words that pass stopword check but are clearly not names: Italian past participles (-ato/-uto/-ito), common adjectives (-ale/-ile/-oso), etc.
- **Add** a pattern-based non-name detector: reject words matching Italian morphological patterns like `/^(che|chi|cosa|come|dove|quando|perché|quello|questa|questi|quelle|ogni|anche|ancora|adesso|allora|comunque|quindi|perciò|però|oppure|sia|tra|fra|con|per|senza)$/i`
- **Require** original-text capitalisation for medium-tier patterns (not just compound/strong)
- **Change** all `status: "applied"` to `status: "suggested"` — remove auto-apply logic entirely
- **Raise** final filter threshold from `confidence >= 0.5` to `confidence >= 0.75`
- **Accept** `language` parameter in request body; pass it to AI review prompt
- **Rewrite** AI review system prompt to be sceptical: instruct it to return confidence 0.0 if no clear name is present, never guess, never use transcript words that aren't proper nouns

### Frontend — `src/components/SpeakerIdentificationBanner.tsx`
- **Remove** the "applied" section rendering (lines 81–166) — since nothing auto-applies, only "suggested" items exist
- **Simplify** the banner to show only suggestions with accept/reject/edit controls
- Or: keep the applied rendering for backward compatibility with already-stored data, but no new items will have "applied" status

### Shared types — `src/lib/speaker-identification.ts`
- **Expand** STOPWORDS and ROLE_WORDS to match the backend lists (keep in sync for any client-side validation)

### Caller — wherever `identify-speakers` is invoked
- **Pass** the transcript language (from job metadata) in the request body as `language`

## 5. Files/Services Affected

| File | Change |
|------|--------|
| `supabase/functions/identify-speakers/index.ts` | Major: remove broad patterns, expand blocklists, rewrite AI prompt, remove auto-apply, raise thresholds, accept language param |
| `supabase/functions/identify-speakers/identify-speakers.test.ts` | Update tests: add Italian non-name rejection cases, remove broad-pattern expectations |
| `src/lib/speaker-identification.ts` | Expand STOPWORDS/ROLE_WORDS, remove "applied" from status type if desired |
| `src/components/SpeakerIdentificationBanner.tsx` | Minor: simplify if auto-apply is fully removed |
| Caller of `identify-speakers` (likely in `post-process` or `JobDetail`) | Pass `language` field |

## 6. Regression Risks

| Risk | Mitigation |
|------|------------|
| Legitimate names caught by expanded blocklist (e.g., a person actually named "Felice") | Keep medium/strong patterns which require explicit intro phrases — if someone says "mi chiamo Felice", it will still work because the intro pattern overrides the stopword |
| Removing auto-apply frustrates users who had names correctly identified | All suggestions still appear in the banner; users just need one tap to accept. This is the correct UX for a trust-sensitive feature |
| Expanded blocklist maintenance burden | Use morphological patterns (regex for common suffixes) rather than exhaustive word lists |
| AI review returning garbage despite prompt rewrite | Final validation layer still checks against blocklists after AI response; AI can only upgrade confidence, never bypass blocklist |

## 7. Manual QA Cases

1. **Italian transcript, no introductions**: Should produce zero suggestions
2. **Italian transcript with "mi chiamo Marco"**: Should suggest "Marco" for the correct speaker
3. **Italian transcript with "sono strutturati"**: Must NOT suggest "Strutturati"
4. **Italian transcript with "sono che..."**: Must NOT suggest "Che"
5. **Italian transcript with "sono contenta"**: Must NOT suggest (stopword)
6. **Italian transcript with "sono il dottore"**: Must NOT suggest "Dottore" (role word)
7. **Italian compound: "sono Camilla, la terapista"**: Should suggest "Camilla"
8. **English transcript with "my name is Sarah"**: Should suggest "Sarah"
9. **English transcript with "I am happy to be here"**: Must NOT suggest "Happy"
10. **Mixed-language transcript**: Should handle correctly per-pattern language
11. **Transcript with multiple speakers, one introduces themselves**: Only that speaker gets a suggestion
12. **Previously stored "applied" results**: Banner still renders them correctly (backward compat)

## 8. Why Option B (Remove Entirely) Was Not Chosen

The feature provides genuine value when transcripts contain explicit self-introductions. The compound and strong pattern tiers (e.g., "mi chiamo X", "my name is X", "I'm X, the therapist") are reliable and high-precision. The problem is localised to the broad tier and insufficient validation — not a fundamental architectural flaw. Removing the entire feature would sacrifice real value to fix a scoped problem. The conservative rebuild eliminates the bad outputs while preserving the good ones, and the shift to suggestion-only (no auto-apply) ensures the user always has final say.

