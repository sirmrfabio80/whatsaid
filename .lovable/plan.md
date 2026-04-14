

# PDF Performance Fix — Final Revised Plan

## Summary

Optimize `src/lib/export-pdf.ts` by batching consecutive blocks into fewer `html2canvas` calls, using a single-pass DOM strategy and PNG-only output.

## Approach

### 1. Single-pass DOM strategy (no duplicate work)

Current code already inserts all block elements into the DOM before rendering. The revised flow:

1. Call `buildPdfBlocks()` to get the fine-grained block list
2. Insert one temporary measurement container into the DOM
3. For each block, inject its HTML into the container, measure `scrollHeight`, record the height, then clear
4. Run the batching algorithm using measured heights — merge consecutive non-`forceNewPage` blocks until combined height approaches usable page height (~800px threshold)
5. Create render elements **only for the batched blocks** — no original per-block render elements are ever created
6. Render each batched element via `html2canvas`, apply existing page-slicing logic, then remove

This means we touch the DOM twice per original block (inject + measure, lightweight) but only do expensive `html2canvas` calls for the batched result — typically one per page of content.

### 2. Performance instrumentation

Add a `PdfPerfLog` logged to `console.info("[PDF perf]", ...)` containing:

- `originalBlockCount` / `batchedBlockCount`
- `totalTimeMs`
- `html2canvasTimeMs` (cumulative)
- `pngEncodeTimeMs` (cumulative)
- `layoutMeasureTimeMs`

### 3. Expected improvement

We expect a substantial reduction in generation time, broadly proportional to the reduction in `html2canvas` calls, to be verified by the new perf instrumentation. For a 200-line transcript batched down to ~10 render calls, the improvement should be significant.

### 4. Constraints

- PNG only — no JPEG
- `RENDER_SCALE = 2` unchanged
- No UI, backend, or export behaviour changes
- Only `src/lib/export-pdf.ts` modified
- All existing tests must pass

