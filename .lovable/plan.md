

# Mobile Notifications UX Improvement

## Behaviour Summary

### Mobile (below `md` / 768px)
- Bell tap navigates to `/notifications` full page (no dropdown)
- `/notifications` page has sticky header with back button, title, mark-all-read, clear-all
- Each notification row shows a permanently visible, 44px-min delete button
- Delete button is visually separated from the main tap area

### Desktop (768px+)
- No change. Bell opens dropdown as before. Delete button appears on hover.

## Files & Changes

### 1. `src/components/NotificationBell.tsx`
- Import `useIsMobile` and `useNavigate`
- On bell click: if mobile, `navigate('/notifications')` and return; otherwise toggle dropdown
- Dropdown rendering wrapped in `!isMobile && open && (...)` so it never appears on mobile

### 2. `src/pages/Notifications.tsx` (new)
- Full-page layout with `min-h-screen` and `bg-background`
- Sticky header: back arrow button + "Notifications" title + mark-all-read / clear-all actions
- Reuses `NotificationItem` with `onClose={() => navigate(-1)}` (or noop since we're on page)
- Empty state matching existing dropdown empty state
- Accessible, spacious layout

### 3. `src/components/NotificationItem.tsx`
- Accept optional `compact` prop (default `true` for dropdown, `false` for full page — or just use responsive classes)
- Delete button classes change:
  - Current: `opacity-0 group-hover:opacity-100 p-1`, icon `w-3 h-3`
  - New: `opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 md:p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0`, icon `w-4 h-4 md:w-3 md:h-3`
- Adjust main button `pr-8` → `pr-14 md:pr-8` to give the larger mobile delete button space
- Delete button positioned further from text content on mobile to avoid accidental taps

### 4. `src/App.tsx`
- Import `Notifications` page
- Add `<Route path="/notifications" element={<Notifications />} />`

### 5. i18n locale files (`en.json`, `fr.json`, `it.json`)
- Add `notifications.backToNotifications` or similar if needed — but `common.back` already exists, so we'll use that. No new keys needed unless we add a page subtitle.

## Regression Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Desktop dropdown accidentally disabled | Low | Conditional on `isMobile` only; desktop path unchanged |
| Delete button overlapping content on mobile | Low | Increased `pr-14` padding on mobile gives space |
| Back navigation from `/notifications` breaks | Low | Use `navigate(-1)` with fallback to `/` |
| NotificationItem layout shift from larger delete button | Low | Responsive classes scoped to `md:` breakpoint |

## Test Plan

1. **Mobile bell → page**: Tap bell on mobile, verify full page opens (not dropdown)
2. **Back navigation**: Tap back on notifications page, verify returns to previous page
3. **Delete on mobile**: Verify delete button always visible, large enough to tap, does not overlap text
4. **Mark all read / clear all**: Verify both actions work on the mobile page
5. **Empty state**: Verify empty state renders correctly on the page
6. **Desktop dropdown unchanged**: On desktop, verify bell still opens dropdown, delete still hover-only
7. **Notification actions**: Verify tapping a notification row still triggers its primary action (navigate to job / download PDF)

