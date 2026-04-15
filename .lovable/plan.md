

# Refined Plan: Three Scoped Fixes

---

## 1. Root Cause Analysis

### A) Page-enter animation
The `page-enter` keyframe in `src/index.css` includes `translateY(8px)` → `translateY(0)`. The class `animate-page-enter` exists in exactly 13 non-homepage files today. `Signup.tsx`, `ClaimShare.tsx`, `SharedPdfDownload.tsx`, and `Notifications.tsx` do **not** use it and will not be touched.

### B) Non-homepage top spacing
Pages use generous vertical padding between navbar and content. Each page type has a different pattern.

### C) Summary tab internal spacing
Two spacing layers are too generous: section card padding (`p-4` — 1rem all sides) and SectionBody paragraph gap (`space-y-2` — 0.5rem). The heading-to-body gap (`mb-1.5`) and between-section gap (`space-y-4`) are correct.

---

## 2. Recommended Fix

### A) Animation
1. Add `page-enter-flat` keyframe (opacity only) and `.animate-page-enter-flat` class to `src/index.css`.
2. Replace `animate-page-enter` → `animate-page-enter-flat` **only** in the 13 non-homepage files listed below. No additions to files that don't already animate.

### B) Top spacing
Reduce padding on non-homepage pages that have excessive spacing:
- `py-10 sm:py-14` → `py-6 sm:py-10` (content pages)
- `py-12` → `py-8` (auth pages that use it: Login, ResetPassword)
- `py-12 sm:py-16` → `py-8 sm:py-12` (legal pages)

Pages without explicit top padding (SetPassword, Pricing, Notifications) are left as-is. Signup, ClaimShare, SharedPdfDownload also get their spacing reduced where applicable.

### C) Summary spacing
- Card padding: `p-4` → `p-3 sm:p-4`
- SectionBody gaps: `space-y-2` → `space-y-1.5` (2 occurrences)

---

## 3. Exact Files/Components/Classes to Touch

### A) Animation — swap `animate-page-enter` → `animate-page-enter-flat`

| File | Occurrences |
|------|-------------|
| `src/index.css` | Add new keyframe + class |
| `src/pages/Profile.tsx` | 1 |
| `src/pages/Settings.tsx` | 1 |
| `src/pages/Convert.tsx` | 1 |
| `src/pages/History.tsx` | 2 |
| `src/pages/JobDetail.tsx` | 1 |
| `src/pages/Login.tsx` | 2 |
| `src/pages/ResetPassword.tsx` | 2 |
| `src/pages/SetPassword.tsx` | 1 |
| `src/pages/Pricing.tsx` | 1 |
| `src/pages/Terms.tsx` | 1 |
| `src/pages/Privacy.tsx` | 1 |
| `src/pages/RefundPolicy.tsx` | 1 |
| `src/components/JobResults.tsx` | 1 |

**Not touched (no existing animation):** `Signup.tsx`, `ClaimShare.tsx`, `SharedPdfDownload.tsx`, `Notifications.tsx`
**Not touched (homepage):** `Index.tsx`

### B) Top spacing

| File | From | To |
|------|------|----|
| `src/pages/Profile.tsx` | `py-10 sm:py-14` | `py-6 sm:py-10` |
| `src/pages/Settings.tsx` | `py-10 sm:py-14` | `py-6 sm:py-10` |
| `src/pages/Convert.tsx` | `py-10 sm:py-14` | `py-6 sm:py-10` |
| `src/pages/History.tsx` (×2) | `py-10 sm:py-14` | `py-6 sm:py-10` |
| `src/pages/JobDetail.tsx` | `py-10 sm:py-14` | `py-6 sm:py-10` |
| `src/pages/Login.tsx` (×2) | `py-12` | `py-8` |
| `src/pages/ResetPassword.tsx` (×2) | `py-12` | `py-8` |
| `src/pages/Signup.tsx` (×2) | `py-12` | `py-8` |
| `src/pages/Terms.tsx` | `py-12 sm:py-16` | `py-8 sm:py-12` |
| `src/pages/Privacy.tsx` | `py-12 sm:py-16` | `py-8 sm:py-12` |
| `src/pages/RefundPolicy.tsx` | `py-12 sm:py-16` | `py-8 sm:py-12` |
| `src/pages/ClaimShare.tsx` | `py-16` | `py-10` |
| `src/pages/SharedPdfDownload.tsx` | `py-16` | `py-10` |

**Not touched (own layout):** SetPassword (flex center, no py), Pricing (hero sections), Notifications (sticky header)

### C) Summary spacing

| File | Line | From | To |
|------|------|------|----|
| `src/components/StructuredSummary.tsx` | ~195 | `p-4` | `p-3 sm:p-4` |
| `src/components/StructuredSummary.tsx` | ~139 | `space-y-2` | `space-y-1.5` |
| `src/components/StructuredSummary.tsx` | ~160 | `space-y-2` | `space-y-1.5` |

---

## 4. Regression Risks

| Risk | Mitigation |
|------|-----------|
| Homepage animation changes | `Index.tsx` not touched; existing keyframe preserved |
| New animation on non-animated pages | Only swapping where class already exists — verified via search |
| Transcript tab affected | StructuredSummary is Summary-tab only |
| Pages feel cramped on desktop | Responsive values keep desktop comfortable |

---

## 5. QA Checklist

1. Homepage: slide-up + fade animation identical to current
2. 13 non-homepage files: fade in without upward shift
3. Signup, ClaimShare, SharedPdfDownload, Notifications: no animation added, behaviour unchanged
4. Content pages (Profile, Settings, Convert, History, JobDetail): reduced top spacing
5. Auth pages (Login, Signup, ResetPassword): reduced vertical padding
6. Legal pages (Terms, Privacy, RefundPolicy): reduced vertical padding
7. ClaimShare, SharedPdfDownload: reduced vertical padding
8. Summary tab mobile: tighter card padding
9. Summary tab: tighter paragraph/list spacing within sections
10. Summary tab desktop: cards retain `p-4` padding
11. Transcript tab: zero visual changes

