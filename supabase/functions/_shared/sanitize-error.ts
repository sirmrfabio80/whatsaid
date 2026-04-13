/**
 * Maps raw backend errors to safe, user-facing messages.
 * Keeps verbose details out of the client-readable jobs.error_message column.
 */
export function sanitizeErrorForClient(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Rate-limit / quota errors
  if (/rate.?limit/i.test(raw) || raw.includes("429")) {
    return "The service is temporarily busy. Please try again in a few minutes.";
  }
  if (/credits?.exhaust/i.test(raw) || raw.includes("402")) {
    return "AI processing credits exhausted. Please add more credits.";
  }

  // Transcription provider errors
  if (/authentication|unauthorized|api.?key/i.test(raw)) {
    return "A backend configuration error occurred. Please contact support.";
  }
  if (/timeout|timed.?out|deadline/i.test(raw)) {
    return "Processing timed out. Please try again with a shorter file.";
  }
  if (/unsupported.*(format|codec|file)/i.test(raw)) {
    return "The audio format is not supported. Please upload an .m4a, .mp3, or .wav file.";
  }
  if (/too.?(large|big|long)|file.?size|duration/i.test(raw)) {
    return "The file is too large or too long to process.";
  }

  // Generic fallback — never leak raw message
  console.error("[sanitize-error] Raw error suppressed from client:", raw);
  return "Something went wrong while processing your file. Please try again.";
}
