

# Increase PDF Font Sizes for Mobile Readability

## Analysis

The PDF is A4 (210mm / 595pt wide). On an iPhone Air (~390pt viewport), the PDF viewer scales to fit width at roughly 0.65x. Current body text at 15px renders at ~10px equivalent on screen — below the 13px readability threshold.

**Target**: Body text should appear at ~13–14px on-screen when the A4 PDF is fitted to an iPhone width. This requires body text of ~20–21px in the PDF source, which is a **~1.33x proportional increase** across all type tokens.

## Proposed Font Size Changes

| Token | Current | New | On-screen equiv (iPhone) |
|-------|---------|-----|-------------------------|
| `BODY_FONT_PX` | 15 | 20 | ~13px |
| `TRANSCRIPT_FONT_PX` | 15 | 20 | ~13px |
| `BULLET_FONT_PX` | 15 | 20 | ~13px |
| `QA_PROMPT_FONT_PX` | 15 | 20 | ~13px |
| `TIMESTAMP_FONT_PX` | 12 | 16 | ~10.5px |
| `META_FONT_PX` | 13 | 17 | ~11px |
| `H1_FONT_PX` | 30 | 40 | ~26px |
| `H2_FONT_PX` | 20 | 26 | ~17px |
| `H3_FONT_PX` | 18 | 24 | ~16px |
| `H4_FONT_PX` | 17 | 22 | ~14px |

## File

`src/lib/export-pdf.ts` — lines 57–66, update the 10 font constant values. No other files affected.

## Risks

- More pages per PDF (text is larger so content wraps more). The pagination logic already handles arbitrary block heights, so no breakage expected.
- Spacing tokens (`SECTION_GAP_MM`, `PARAGRAPH_GAP_MM`, margins in `markdownToHtml`) remain unchanged — they are already in mm and proportioned correctly.

