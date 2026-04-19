

## Bug

The PDF export places sub-section headings (e.g. `### Terms to Know`) at the bottom of a page even when their content wraps to the next page, leaving an orphan heading. Root cause:

- `Pen.heading(level)` (export-pdf.ts:251) writes the heading without checking that any content can follow it on the same page.
- `Pen.sectionHeading()` only reserves 14mm — enough for the heading line itself, not for the heading **plus** at least the first two body lines.
- `renderMarkdown()` walks line-by-line, so each bullet decides independently whether to break — never grouped with its preceding heading.

## Fix (minimal, surgical)

Introduce a "keep-with-next" rule: when rendering a heading (h2/h3/h4 from markdown, plus `sectionHeading`), measure the height of the heading itself **plus the next two non-empty body lines** in the same markdown block. If that combined height would overflow the current page, force a page break **before** the heading.

Concretely, in `src/lib/export-pdf.ts`:

1. **New helper `measureNextLines(lines, startIdx, count)`** — looks ahead in the markdown line array and returns the rendered height (mm) of the first `count` non-empty content lines after the heading, using the same wrapping logic already in `Pen.plain()`/`Pen.rich()` (compute via `pdf.splitTextToSize` at the bullet/body width with `F.bullet`/`F.body` and `LH`). Stops early at the next heading (`#`/`##`/`###`/`####`) — those are handled by their own keep-with-next pass.

2. **Refactor `renderMarkdown(pen, text)`** to operate on an indexed array of lines so it can look ahead. Before emitting any heading, compute:
   `need = headingHeight(level) + before + after + measureNextLines(lines, i+1, 2)`
   and call `pen.pageBreakHard(need)` (a new method that always breaks if `y + need > MAX_Y`, distinct from the per-line check). This guarantees heading + first two body lines stay together, fixing "Terms to Know" and any analogous sub-section.

3. **Apply the same rule in `sectionHeading()`** for top-level sections ("Summary", "Questions & Answers", "Transcript") so e.g. "Questions & Answers" doesn't end up orphaned at page bottom either. For the Transcript section the "two lines" are the first two transcript lines — measured via `splitTextToSize` at `F.transcript`.

4. **Headings inside Q&A loop** (`pen.rich([...Q: prompt])` at line 451) — wrap with the same keep-with-next: ensure Q prompt + first 2 lines of answer fit; otherwise break before the prompt.

## What does NOT change

- Font sizes, colours, margins, line heights, footer rendering — all untouched.
- Existing `pen.pageBreak(need)` for individual lines is kept as the inner safety net.
- No new dependencies.

## Files to modify

- `src/lib/export-pdf.ts` — add `measureNextLines`, `Pen.headingNeedsBreak(...)` / `pageBreakHard(...)`, refactor `renderMarkdown` to indexed loop, update `sectionHeading` and the Q&A loop.

## Verification

- Re-export the same Italian transcript that produced the attached PDF; confirm "Terms to Know" no longer sits alone at the bottom of page 1.
- Add a unit-style check in `src/test/export.test.ts`: build markdown where a `###` heading falls near a synthetic page boundary and assert (via parsing the rendered text positions or a deterministic page-break log we can expose for tests) that the heading and its first two bullets share a page. Practical alternative if instrumenting is too invasive: keep the existing `buildPdfDocumentHtml`-style content tests and add a focused assertion that `renderMarkdown` calls `pageBreakHard` before a heading whose lookahead would overflow (mock `Pen`).
- Manual QA: regenerate PDF, convert pages to JPEG, visually verify no orphan headings on any page.

## Risk

Low. The change only adds preventive page breaks; it never suppresses content. Worst case: a tiny amount of extra whitespace at the bottom of one page when a heading is forced to the next — which is exactly the desired behaviour.

