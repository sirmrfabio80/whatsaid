/** Escape special regex characters */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace speaker labels in text with their renamed versions */
export function applySpeakerNames(
  text: string,
  names: Record<string, string>,
): string {
  let result = text;
  for (const [original, renamed] of Object.entries(names)) {
    if (renamed) {
      // Replace "Speaker A:" at the start of lines
      const regex = new RegExp(`^${escapeRegex(original)}:`, "gm");
      result = result.replace(regex, `${renamed}:`);
      // Replace inline references
      const inlineRegex = new RegExp(`\\b${escapeRegex(original)}\\b`, "g");
      result = result.replace(inlineRegex, renamed);
    }
  }
  return result;
}
