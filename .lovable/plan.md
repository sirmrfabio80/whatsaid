

# Fix: iOS Safari auto-zoom on Share email input

## Root Cause
Line 45: `className="h-10 rounded-lg text-sm"` — `text-sm` computes to 14px, which triggers iOS Safari's auto-zoom on focus.

## Changes

### `src/components/ShareButton.tsx` — 2 scoped fixes

**1. Input font size (line 45)**
Change `text-sm` to `text-base md:text-sm` so mobile gets 16px (no zoom) and desktop keeps 14px.

```
className="h-10 rounded-lg text-base md:text-sm"
```

**2. Blur input before sheet closes (lines 109, 123)**
Before closing the sheet after send, blur the active element so iOS resets the viewport. Update both `setTimeout` callbacks:

```typescript
// In handleSendEmail (line 109)
setTimeout(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  setOpen(false); setSent(false); setEmail("");
}, 1500);

// In handleShareRecord (line 123)
setTimeout(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  setOpen(false); setSentRecord(false); setEmail("");
}, 1500);
```

**3. Blur on sheet close (line 129)**
Also blur when the user dismisses the sheet manually:

```typescript
const handleOpenChange = (next: boolean) => {
  if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  setOpen(next);
  if (!next) {
    setTimeout(() => { setEmail(""); setSent(false); setSentRecord(false); }, 200);
  }
};
```

No other files are modified. No global viewport changes.

