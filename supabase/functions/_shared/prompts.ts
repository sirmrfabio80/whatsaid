/**
 * Shared AI prompt builders for summary + custom-output generation.
 *
 * These prompts live in `post-process` (initial generation) and `regenerate`
 * (re-runs after transcript edits or language switches). They MUST stay in
 * sync — divergence causes silent inconsistency between a job's first
 * summary and any later regeneration.
 *
 * Centralizing here means:
 *   - One place to tune wording, structure, or rules.
 *   - One place to evolve the language enforcement directive.
 *   - Type-checked language inputs at every call site.
 *
 * If you change a prompt, expect changes in BOTH functions' output.
 */

/**
 * Hard language directive appended to every summary system prompt.
 *
 * Empirically the model otherwise drifts to English mid-output, so we
 * repeat the instruction with deliberate emphasis. Keep this wording
 * stable — A/B testing showed shorter variants regress non-English jobs.
 */
export function buildLanguageInstruction(language: string): string {
  return `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE output in ${language}. Every heading, every bullet point, every sentence must be in ${language}. Do NOT use English unless ${language} IS English. This is mandatory and non-negotiable.`;
}

/**
 * System prompt for the structured-summary output.
 *
 * Produces the four-section markdown contract the UI parses:
 *   Overview / Key Points / Decisions & Next Steps / Terms to Know.
 * Section names are translated; structure is fixed.
 */
export function buildSummarySystemPrompt(language: string): string {
  return `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries designed to be easy to scan and share.

Your output MUST use the following markdown structure with exactly these section headings (translate the heading names into the output language):

## Overview
A concise 2-3 paragraph summary of what was discussed and the overall outcome.

## Key Points
A bullet list of the most important facts or information shared. Keep each point to 1-2 sentences.

## Decisions & Next Steps
A bullet list of decisions made, action items, follow-ups, or next steps. Include who is responsible and any dates mentioned.

## Terms to Know
A bullet list of specialised or technical terms with brief plain-language explanations. Only include this section if there are terms a non-specialist would find unclear. Omit entirely if not needed.

Rules:
- Use markdown: ## for headings, - for bullets, **bold** for emphasis.
- Be factual and precise. Do not invent information.
- Keep bullet points concise and scannable.${buildLanguageInstruction(language)}`;
}

/**
 * Standard user prompt that pairs with `buildSummarySystemPrompt`.
 * Kept as a builder (not a constant) because it interpolates the transcript.
 */
export function buildSummaryUserPrompt(transcript: string): string {
  return `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;
}

/**
 * System prompt for custom-prompt outputs (user-provided instruction over
 * a transcript). Intentionally minimal — the user's instruction is the
 * directive; this prompt only constrains tone and prevents hallucination.
 */
export const CUSTOM_OUTPUT_SYSTEM_PROMPT =
  `You are a professional analysis assistant. The user has provided a transcript and a custom instruction. Apply the instruction to the transcript and produce a clear, well-structured response. Be factual and precise. Do not invent information not present in the transcript.`;

/**
 * User prompt that pairs the custom instruction with the transcript.
 */
export function buildCustomUserPrompt(instruction: string, transcript: string): string {
  return `Instruction: ${instruction}\n\nTranscript:\n${transcript}`;
}

// ─── title generation (generate-title) ───────────────────────────────────────

/**
 * Single-shot system prompt for generating a short title from a transcript
 * excerpt. The model is asked to mirror the transcript's language so titles
 * stay native — do NOT pass a language hint here.
 */
export const TITLE_SYSTEM_PROMPT =
  "Generate a short, descriptive title (max 6 words) for this audio recording based on its transcript. The title should be in the same language as the transcript. Return ONLY the title text, nothing else. No quotes, no explanation.";

// ─── auto-tagging (generate-tags / auto-tag) ─────────────────────────────────

/**
 * System prompt for the auto-tagging pass. Tags are intentionally pinned to
 * English so the user-facing tag taxonomy stays consistent across jobs of
 * different transcript languages.
 */
export const TAGS_SYSTEM_PROMPT = `You are a tagging assistant. Given a transcript, return a JSON array of 3 to 6 short, reusable tags that capture the main topics, meeting type, or domain discussed.

Rules:
- Return ONLY a JSON array of strings, e.g. ["tag1","tag2","tag3"]
- Each tag must be 1–4 words, lowercase
- Tags must ALWAYS be in English, regardless of the transcript language
- Tags should be high-signal: topic, domain, or meeting type
- Do NOT include generic filler like "discussion", "meeting", "conversation", "audio"
- Do NOT invent names, companies, or entities not clearly stated in the transcript
- Do NOT include dates, timestamps, or speaker names as tags
- Minimum 3 tags, maximum 6 tags`;

/**
 * User prompt that ships the (truncated) transcript to the tagger.
 * Caller is responsible for slicing — `auto-tag.ts` caps at 12k chars.
 */
export function buildTagsUserPrompt(transcript: string): string {
  return `Generate tags for this transcript:\n\n${transcript}`;
}

// ─── speaker name verification (identify-speakers) ───────────────────────────

/**
 * Sceptical verifier prompt: takes already-extracted candidate names and
 * either confirms each as a real person name or rejects it. Tuned for high
 * precision — false positives (wrong-name suggestions) are far worse than
 * false negatives, so the prompt biases toward "confidence: 0.0 when unsure".
 *
 * `language` is an optional ISO/native label included as a parsing hint;
 * pass `null` to omit.
 */
export function buildSpeakerVerifierSystemPrompt(language: string | null): string {
  const langHint = language ? `\nTranscript language: ${language}` : "";
  return `You are a SCEPTICAL speaker name verifier for transcripts.

Given transcript segments and candidate name extractions, verify whether each candidate is a real person name.
${langHint}

CRITICAL RULES:
- You must REJECT any candidate that is NOT clearly a person's proper name
- Common words, adjectives, verbs, past participles, articles, pronouns, role titles, and profession words are NEVER valid names
- If no clear person name is identifiable from the evidence, set confidence to 0.0
- Do NOT infer, guess, or fabricate names — only confirm names with explicit evidence
- A person name must appear as a self-introduction (e.g. "mi chiamo Marco", "my name is Sarah")
- "sono strutturati", "sono che", "I am happy" do NOT contain person names
- Put roles/titles in the "role" field (e.g. "terapista occupazionale"), never in "inferred_name"
- Capitalise proper names correctly
- Return a JSON array: [{"speaker_label": "...", "inferred_name": "...", "confidence": 0.0-1.0, "role": "..."}]
- When in doubt, return confidence 0.0 — it is better to miss a name than to suggest a wrong one`;
}

/**
 * User prompt that ships the candidate list + relevant transcript context
 * to the verifier. The two strings are pre-formatted by the caller.
 */
export function buildSpeakerVerifierUserPrompt(
  candidateDescription: string,
  relevantLines: string,
): string {
  return `Verify these candidate extractions (reject any that are not real person names):\n${candidateDescription}\n\nRelevant transcript segments:\n${relevantLines}`;
}

// ─── speaker attribution suggestions (suggest-speakers) ──────────────────────

/**
 * System prompt for re-attributing existing transcript segments to a newly
 * added speaker. The model only suggests ownership changes — it never
 * rewrites text. `truncated` toggles an extra hint when the middle of the
 * transcript was elided to fit the context window.
 */
export function buildSpeakerSuggestSystemPrompt(args: {
  targetSpeaker: string;
  existingSpeakers: string[];
  truncated: boolean;
}): string {
  const { targetSpeaker, existingSpeakers, truncated } = args;
  return `You are a transcript speaker-attribution assistant.

You are given a transcript with speaker labels and segment IDs. A new speaker "${targetSpeaker}" has been added but has no segments assigned yet.

Your task: identify which existing segments most likely belong to "${targetSpeaker}" based on conversational patterns, turn-taking, topic continuity, and context.

Existing speakers: ${existingSpeakers.join(", ")}

Rules:
- Return ONLY a JSON array of objects with "id" (segment ID) and "confidence" (0.0 to 1.0)
- Only include segments you are reasonably confident belong to "${targetSpeaker}" (confidence >= 0.5)
- Do NOT modify any text — only suggest ownership changes
- Do NOT assign segments that clearly belong to their current speaker
- Look for patterns: if the transcript has Speaker A only but clearly contains two distinct voices/perspectives, suggest which segments belong to the new speaker
- If you cannot identify any segments for the new speaker, return an empty array []
${truncated ? "\n- Note: The middle section shows only previews. Use the full start/end context and speaker patterns to make inferences." : ""}`;
}

/**
 * User prompt that pairs the formatted transcript with the target-speaker
 * directive.
 */
export function buildSpeakerSuggestUserPrompt(
  targetSpeaker: string,
  formattedTranscript: string,
): string {
  return `Analyze this transcript and suggest which segments belong to "${targetSpeaker}":\n\n${formattedTranscript}`;
}
