

# Pre-opened Tab Pattern for PDF Export

## How it works

1. **On user click** (`startPdfExport`): immediately call `window.open("", "_blank")` — synchronous within the user gesture, so browsers allow it. Write minimal loading HTML into that tab.

2. **Carry the tab reference** through the existing async flow via a local `pdfTab` variable inside the fire-and-forget IIFE (already scoped per export).

3. **On success**: get signed URL, then `pdfTab.location.href = signedUrl` to navigate the already-open tab to the PDF. Notification still created as before.

4. **On failure**: write a generic safe error message into the tab — never inject raw error strings into `document.write`. Notification still created as before.

5. **If `window.open` returns null** (rare — e.g. aggressive blocker): skip the tab, fall back to notification-only.

## Files to change

| File | Change |
|---|---|
| `src/contexts/NotificationsContext.tsx` | In `startPdfExport`: pre-open tab before the async IIFE; write loading HTML; on success navigate tab to signed URL; on failure write safe generic error HTML; remove the old `openExport` call at lines 324–328 |

One file only. No changes to other export formats, notification flow, or storage.

## Tab reference flow

```typescript
// Synchronous — inside startPdfExport, before the async IIFE
const pdfTab = window.open("", "_blank");
if (pdfTab) {
  pdfTab.document.write(`
    <!DOCTYPE html><html><head><title>WhatSaid</title>
    <style>body{font-family:Inter,sans-serif;display:flex;align-items:center;
    justify-content:center;height:100vh;margin:0;background:#0F172A;color:#e2e8f0;}
    .c{text-align:center}.s{animation:spin 1s linear infinite;width:24px;height:24px;
    border:3px solid #334155;border-top-color:#818cf8;border-radius:50%;margin:0 auto 16px}
    @keyframes spin{to{transform:rotate(360deg)}}</style></head>
    <body><div class="c"><div class="s"></div><div>Preparing PDF…</div></div></body></html>
  `);
  pdfTab.document.close();
}

// Inside the async IIFE, pdfTab is captured via closure

// On success (replaces lines 324-328):
if (pdfTab && !pdfTab.closed) {
  const { data: urlData } = await supabase.storage
    .from("exports").createSignedUrl(storagePath, 600);
  if (urlData?.signedUrl) {
    pdfTab.location.href = urlData.signedUrl;
  }
} else {
  toast.info(t("notifications.pdfReadyCheckNotifications"));
}

// On failure — generic safe message, no raw errorMsg injection:
if (pdfTab && !pdfTab.closed) {
  pdfTab.document.open();
  pdfTab.document.write(`
    <!DOCTYPE html><html><head><title>WhatSaid</title>
    <style>body{font-family:Inter,sans-serif;display:flex;align-items:center;
    justify-content:center;height:100vh;margin:0;background:#0F172A;color:#e2e8f0;}
    .c{text-align:center;max-width:400px}h2{color:#f87171}</style></head>
    <body><div class="c"><h2>Export failed</h2>
    <p>Something went wrong while preparing your PDF.</p>
    <p style="margin-top:12px;color:#94a3b8">Check your notifications for details.</p>
    </div></body></html>
  `);
  pdfTab.document.close();
}
```

## Success / failure / fallback matrix

| Scenario | Tab behavior | Notification |
|---|---|---|
| Tab opened + export succeeds | Navigates to signed PDF URL | Created as usual |
| Tab opened + export fails | Shows generic safe error message | Created as usual |
| Tab blocked (`null`) + export succeeds | Nothing — toast says "check notifications" | Created as usual |
| Tab blocked (`null`) + export fails | Nothing | Created as usual |
| User closes tab before completion | Skipped (`pdfTab.closed`) — toast fallback | Created as usual |

## Regression risks

**Low risk.** Scope is explicitly limited to PDF export tab behavior only. The only change is replacing `openExport()` at line 324 with pre-opened tab navigation. All other export formats (TXT, JSON, DOCX), the notification pipeline, storage uploads, and async job tracking are completely untouched. The `openExport` function remains available for notification-item clicks where it works because those are direct user gestures.

