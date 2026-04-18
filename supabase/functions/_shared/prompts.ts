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
