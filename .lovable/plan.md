

# Update Pricing Memory Files

## Summary
Update `mem://features/pricing` and `mem://index.md` to reflect approved unit economics analysis (GBP only). Mark cost estimates as working estimates pending provider confirmation. Mark implementation details (tiers, credit system, file caps) as current truth.

## Changes

### File 1: `mem://features/pricing`

**Structure:**
1. **Current Tiers** — marked as implementation truth
2. **Credit System** — marked as implementation truth (1 credit = 15 min, etc.)
3. **File Constraints** — marked as implementation truth (100MB, 60 min max)
4. **Regeneration Rules** — marked as implementation truth (3× summary, 10× questions)
5. **Cost Model** — marked as **working estimates pending provider confirmation**:
   - AssemblyAI: £0.19/hr → £0.048 per 15-min credit (estimate, not yet verified from invoice)
   - Lovable AI: ~£0.001 per credit (estimate)
   - Paddle fee: 5% + £0.40 (estimate, not yet confirmed from dashboard)
   - Total variable cost: ~£0.049 per credit (estimate)
6. **Fixed Costs** — marked as implementation truth (Lovable Pro £22, domain £0.83)
7. **Unit Economics** — marked as **working estimates** with disclaimer that margins depend on confirmed provider pricing
8. **Risks and Assumptions** — explicit list of unconfirmed items
9. **Architecture Notes** — implementation truths (atomic credit deduction, audio deletion, Paddle as provider)
10. **Currency Support** — implementation truth (GBP for analysis, GBP/USD/EUR for UI)

### File 2: `mem://index.md`

**Update pricing memory description:**
- From: "Guest pricing, credit packs, regeneration costs"
- To: "Tiers (£4.99/£14.99/£39.99), credit system, cost model (GBP), unit economics (working estimates pending provider confirmation)"

## Wording Strategy

**Implementation truth** sections use present-tense statements ("Current tiers are...", "Defined in...").

**Working estimate** sections include explicit status disclaimers:
- "**Status**: Estimate based on published pricing; not yet verified from actual AssemblyAI invoice"
- "**Status**: Not yet confirmed from actual Paddle dashboard; should be validated"
- "**Status**: These margins are projections only. Actual margins depend on confirmed provider pricing."

## No Code Changes

No functional code, UI, or billing logic touched. Memory files only.

