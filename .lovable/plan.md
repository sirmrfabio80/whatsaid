

# Open PDF in New Tab — Revised Plan

## Changes

### 1. `src/contexts/NotificationsContext.tsx`

**Add `openExport` method** (alongside existing `downloadExport`):
- Creates signed URL (600s TTL)
- Opens via `window.open(signedUrl, "_blank", "noopener,noreferrer")`
- Returns `boolean` — if `window.open` returns null, returns false

**Update step 6 in `startPdfExport`** (line 309-310):
- Replace `await downloadExport(...)` with `await openExport(...)`
- If open fails, show toast: "PDF ready — check notifications to view"

**Export `openExport`** in context type alongside `downloadExport`.

### 2. `src/components/NotificationItem.tsx`

**Update `handleClick`** for file notifications (lines 44-55):
- Call `openExport` instead of `downloadExport` (opens in new tab)
- Since notification click is user-initiated, popup blocking is unlikely

**Update label** (lines 108-112):
- Change `<Download /> Download` to `<FileText /> View PDF`
- Import adjustment: remove `Download` from lucide imports if unused

## Details

- `window.open` uses `"noopener,noreferrer"` for security
- Signed URL TTL: 600s (generous for viewing)
- Each notification click generates a fresh signed URL, so expiry is not a concern
- `downloadExport` is preserved for any future download-specific needs
- TXT/JSON/DOC exports are completely untouched

## Regression risks

Minimal — only PDF notification behaviour changes. Non-PDF exports use separate code paths.

