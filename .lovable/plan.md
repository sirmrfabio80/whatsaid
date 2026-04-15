

# Fix Raw Markdown Headings Showing in Question Answers

## Problem

The `SectionBody` component in `StructuredSummary.tsx` renders Q&A answer content. It handles bold/italic inline markdown and bullet lists, but does **not** strip or render heading markers (`###`, `##`, etc.). When the AI returns answers with markdown headings, the raw `###` characters appear in the UI.

## Fix

In `SectionBody` (file: `src/components/StructuredSummary.tsx`, around line 86), add heading detection to the rendering logic:

1. **Before rendering each line**, check if it starts with `#` markers (e.g. `### Heading`)
2. Strip the `#` prefix and render the text as a **bold styled span** (since these are inline sub-sections within a card, not page-level headings)
3. Apply this in both the bullet-list branch and the prose-fallback branch

Specifically, add a helper like:

```typescript
function stripHeading(line: string): { text: string; isHeading: boolean } {
  const match = line.match(/^#{1,4}\s+(.*)/);
  if (match) return { text: match[1], isHeading: true };
  return { text: line, isHeading: false };
}
```

Then in the rendering, heading lines get rendered as `<p className="text-sm font-semibold ...">` instead of regular prose.

## Scope

- **One file**: `src/components/StructuredSummary.tsx`
- No backend or edge function changes needed — this is purely a rendering fix

