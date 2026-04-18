

# Revised refactor plan — evidence-based corrections

## What I got wrong in the previous plan

1. **My shadcn "unused" list was partially wrong.** Re-checking with proper grep, `accordion, calendar, collapsible, sonner, switch, toggle, avatar, sheet, separator, scroll-area, tabs` are all imported (1-2x each). My previous count of "22 dead" was inflated by a flawed grep.
2. **I overstated the benefit of deleting unused shadcn files.** Vite tree-shakes unimported modules out of the production bundle. Deleting them is **repo hygiene**, not a runtime/bundle win.
3. **I under-prioritised true product dead code.** Two edge functions (`eval-transcribe`, `eval-upload`) are explicitly self-documented as "DELETE after evaluation" and have zero callers. One edge function (`generate-tags`) has zero callers anywhere. That's real product dead code I missed.
4. **Sequencing was wrong.** Putting cleanup first was a reflex, not evidence-based. Indexes and bucket-policy fixes deliver actual user-facing wins; cleanup delivers cognitive-load wins. Performance fixes should go first.

---

## 1) Corrected dead-code section

### Verified evidence
- **21 shadcn primitives have zero importers** (re-verified): `alert, aspect-ratio, breadcrumb, carousel, chart, command, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, progress, radio-group, resizable, sidebar, slider, table, toggle-group`.
- **1 custom component has zero importers**: `NavLink.tsx`.
- **3 edge functions have zero callers**: `eval-transcribe`, `eval-upload` (both self-documented as "DELETE after evaluation"), `generate-tags`.
- **All admin sub-components are wired** through `Admin.tsx → LogsTab → {JobAuditCard, JsonBlock, EdgeLogsList}` and `TranscribeTemplatesTab → RequestPreviewPanel`. Not dead.
- **All hooks are used at least once.** No dead hooks.
- **All `lib/*` files are used at least once.** No dead libs.

### Classified recommendations

| Item | Classification | Reason |
|---|---|---|
| `src/components/NavLink.tsx` | **remove now** | Zero references, custom product code, no ambiguity. Pure cognitive-load win. |
| `supabase/functions/eval-transcribe/` | **remove now** | Self-documented "Internal-only … DELETE after evaluation". Zero callers. Real product dead code with future-confusion risk (someone might think it's a real entrypoint). |
| `supabase/functions/eval-upload/` | **remove now** | Same — self-documented as temporary. Zero callers. |
| `supabase/functions/generate-tags/` | **remove after consolidation** | Zero frontend callers, but auto-tagging is referenced via `_shared/auto-tag.ts` in other functions. Must verify no edge-to-edge invocation before deleting. Holds a small ambiguity risk — confirm in Phase 6. |
| 21 zero-import shadcn primitives | **keep as dormant toolkit code** | shadcn primitives are isolated, single-file, well-typed, with no cross-dependencies on app code. Vite tree-shakes them out of the bundle, so there is **no runtime, bundle, or build-time cost**. Deleting them risks the next "add a feature using shadcn add carousel" workflow re-creating identical files. **Cost of keeping ≈ 0; cost of deleting = re-add friction later.** Recommend keeping. |
| 11 single-import shadcn primitives (`accordion, calendar, collapsible, sonner, switch, toggle, avatar, sheet, separator, scroll-area, tabs`) | **keep** | Live imports. My earlier "verify-then-remove" was wrong. |
| Inline clipboard logic in 4 components | **remove after consolidation** | Real duplication. Remove only after `useCopyToClipboard` lands (Phase 4). |
| `parseSegments` re-exported from `TranscriptEditor` | **remove after consolidation** | Leaky abstraction. Move to `lib/transcript.ts` first (Phase 3), then remove the re-export. |

### What kind of benefit each removal actually delivers
- `NavLink`, `eval-*`: **cognitive load + future-confusion reduction**. Not bundle size, not runtime.
- `generate-tags` (if confirmed dead): **edge-function inventory clarity + smaller deploy surface**.
- Consolidations (clipboard, parseSegments): **maintainability** — fixes propagate to one place.
- Dormant shadcn: **no benefit to deletion**, real benefit to keeping.

---

## 2) Corrected phase order

Re-ranked by **value × safety**, not by cleanup instinct.

| # | Phase | Type of win | Risk | Why this position |
|---|---|---|---|---|
| 1 | **DB indexes (8 indexes)** | Real user-facing perf — History/JobDetail load faster | Very low | Highest value-to-risk ratio in the entire plan. No code change. |
| 2 | **Storage LIST policy tightening** | Security posture — clears linter warnings | Very low | Migration-only, no UI impact. |
| 3 | **Trivial dead-code removal** (`NavLink`, `eval-transcribe`, `eval-upload`) | Cognitive load; removes self-documented "delete me" code | Zero | Cheap and unambiguous. Done in one tiny commit. |
| 4 | **Shared utilities & primitives** (`useCopyToClipboard`, `useDebouncedValue`, `EmptyState/ErrorState/LoadingState`, `PageShell`, move `parseSegments → lib/transcript.ts`, `JobMeta → types/job.ts`) | Unblocks god-component splits | Low | Must come before data-layer migration so new hooks can use them. |
| 5 | **Data layer (`src/api/` + React Query) — per-resource** | Kills the duplicate-fetch class of bugs (PDF, share recipients, profiles) | Medium if rushed | Sequenced one resource at a time: profiles → jobs → outputs → credits. |
| 6 | **Verify + remove `generate-tags`** | Edge inventory clarity | Low (after verification) | After data layer is in, easier to confirm no stale caller. |
| 7 | **Edge `_shared/edge.ts` extraction** (GH) | -200 LOC duplication, consistent error mapping | Low per function | After phase 6 so `generate-tags` isn't migrated then deleted. |
| 8 | **Split `JobResults.tsx`** (GH) | Future bug fixes become per-tab not whole-page | High in one shot | Needs phases 4-5 done first. |
| 9 | **Split `TranscriptEditor.tsx`** (GH) | Same | High | Largest behavioural file; do last. |
| 10 | **Mobile primitives consolidation** (`MobileBottomSheet`, `useResponsiveLayout`) | Kills "keyboard covers input" regression class | Low after phase 4 | UI consolidation reads cleanly once primitives exist. |
| 11 | **Final dead-code sweep** | Cleanup of consolidation-derived dead code | Very low | Only meaningful after phases 4-10. |

**Why dead code is no longer first:** indexes deliver real user-perceived performance; cleanup delivers maintainability. With limited prompts/credits, the user-facing win wins.

---

## 3) Decision note on each previously listed "safe-to-remove-now" item

| Previous claim | Revised verdict | Why |
|---|---|---|
| `NavLink.tsx` — remove now | **Confirmed remove now** | Zero refs, custom code. |
| 22 shadcn primitives — remove now | **Reversed: keep as dormant toolkit code** | Tree-shaken anyway; deleting only adds re-add friction. No real benefit. |
| `accordion/calendar/collapsible/separator/sheet/sonner/switch/avatar` — verify then remove | **Reversed: keep, all are imported** | My grep was wrong; they have live imports. |
| `audio-channels.ts` — keep | Confirmed keep | Used by Convert. |
| `RequestPreviewPanel.tsx` — likely keep | **Confirmed keep** | Imported by `TranscribeTemplatesTab`. |
| `eval-upload`, `eval-transcribe` — likely keep behind admin route | **Reversed: remove now** | Files self-document as "DELETE after evaluation". Zero callers. Keeping them risks future devs treating them as real endpoints. |

---

## 4) Revised Lovable prompt sequence

Strict rule: one phase per prompt; never combine schema + UI; never combine resource migrations.

1. **"Add 8 missing DB indexes"** — migration only.
2. **"Tighten `avatars` and `email-assets` storage LIST policies"** — migration only.
3. **"Delete NavLink.tsx and the two eval-* edge functions"** — single tiny commit.
4. **"Add `useCopyToClipboard` hook + migrate the 4 inline clipboard copies"**.
5. **"Add `useDebouncedValue` hook + migrate HistoryFilters and ShareButton"**.
6. **"Add `<EmptyState>` / `<ErrorState>` / `<LoadingState>` and migrate the History page only"**.
7. **"Move `parseSegments` to `src/lib/transcript.ts` and `JobMeta` to `src/types/job.ts`"**.
8. **"Introduce React Query data layer for Profiles only"** (`src/api/profiles.ts`, migrate Profile + Settings).
9. **"React Query for Jobs (History page only)"**.
10. **"React Query for JobOutputs (JobDetail read path only)"**.
11. **"Verify no caller of `generate-tags` edge function and delete it if confirmed orphaned"**.
12. **(GH) Edge `_shared/edge.ts` extraction**.
13. **(GH) Split `JobResults.tsx`**.
14. **(GH) Split `TranscriptEditor.tsx`**.
15. **"Add `<MobileBottomSheet>` primitive and migrate ShareButton only"**.
16. **"Migrate HistoryFilters to `<MobileBottomSheet>`"**.
17. **"Final dead-code sweep — remove now-obsolete `use-keyboard-inset` consumers and unused imports"**.

---

## Closing answers

- **What cleanup should genuinely happen early (Phase 3):** `NavLink.tsx`, `eval-transcribe`, `eval-upload`. Three files, self-evidently dead, zero ambiguity. One 30-second prompt.
- **What cleanup should be postponed:** clipboard duplication, `parseSegments` re-export, `generate-tags` deletion — all dependent on consolidation landing first.
- **What cleanup is not worth spending credits on right now:** **the 21 unused shadcn primitives**. They are tree-shaken from the bundle, isolated, harmless, and deleting them only buys re-add friction the next time you `npx shadcn add carousel`. Spend those credits on indexes and the React Query migration instead — both deliver real, measurable wins.

