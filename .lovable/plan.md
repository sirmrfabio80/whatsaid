

# Fix: Mobile Input Focus Zoom Issue

## 1. Root Cause Analysis

**Primary cause: iOS Safari auto-zoom on inputs with font-size below 16px.**

iOS Safari automatically zooms the viewport when a user focuses an input whose computed font-size is less than 16px. Once zoomed, Safari does not reliably zoom back out when the input loses focus.

Affected components and their current font sizes on mobile:

| Component | Current mobile font | File |
|-----------|-------------------|------|
| `Textarea` | `text-sm` (14px) always | `src/components/ui/textarea.tsx` |
| `Select` trigger | `text-sm` (14px) always | `src/components/ui/select.tsx` |
| `CommandInput` (cmdk) | `text-sm` (14px) always | `src/components/ui/command.tsx` |
| `Input` | `text-base` mobile / `md:text-sm` desktop — **already correct** | `src/components/ui/input.tsx` |
| `InputOTP` slot | `text-sm` (14px) always | `src/components/ui/input-otp.tsx` |
| `SidebarInput` | inherits from `Input` — OK | `src/components/ui/sidebar.tsx` |
| Share email field | overridden to `text-base md:text-sm` — OK | `src/components/ShareButton.tsx` |

**Secondary cause: viewport meta tag missing `maximum-scale=1`.**

The current viewport tag is `width=device-width, initial-scale=1.0` — it does not prevent user/auto zoom. Adding `maximum-scale=1` is the nuclear option but harms accessibility (prevents pinch-to-zoom). The font-size fix is preferred and sufficient.

**No transform/layout issues identified.** The Drawer (vaul) uses standard fixed positioning; it does not apply viewport-level transforms that would amplify zoom.

## 2. Recommended Fix Strategy

**Apply the same pattern already used in `Input`**: use `text-base` (16px) on mobile, `md:text-sm` on desktop, for every focusable text-input control.

This is the minimal, standards-compliant fix. No viewport meta hacks. No JavaScript workarounds.

## 3. Exact Files and Changes

### `src/components/ui/textarea.tsx`
- Change `text-sm` → `text-base md:text-sm` in the className string.

### `src/components/ui/select.tsx`
- In `SelectTrigger`, change `text-sm` → `text-base md:text-sm`.

### `src/components/ui/command.tsx`
- In `CommandInput`, change `text-sm` → `text-base md:text-sm`.

### `src/components/ui/input-otp.tsx`
- In `InputOTPSlot`, change `text-sm` → `text-base md:text-sm`.

### No changes needed:
- `Input` — already has `text-base md:text-sm`
- `ShareButton` email field — already overridden to `text-base md:text-sm`
- `SidebarInput` — inherits from `Input`
- `AudioUploader` file input — hidden, not focusable
- `AvatarUpload` file input — hidden, not focusable
- Auth pages (`Login`, `Signup`, `ResetPassword`, `SetPassword`) — all use `Input` component
- `SpeakerIdentificationBanner` — uses `Input` component
- `HistoryFilters` — uses `Input` component
- `TranscriptionSettings` — uses `Textarea` (covered above)
- `TranscriptEditor` — uses `Textarea` (covered above)
- Drawer/Sheet — no input elements of their own; they host the above components
- `index.html` viewport meta — no change (avoid breaking pinch-to-zoom accessibility)

## 4. Regression Checklist

- Verify desktop `Input`, `Textarea`, `Select`, `CommandInput` still render at `text-sm` (14px) — confirmed by `md:text-sm` breakpoint.
- Verify no layout shifts on desktop from the 2px font-size difference at mobile widths — these components are already `h-10` / `min-h-[80px]` so height is fixed.
- Verify `InputOTP` slots still align correctly at 16px — the slot is `w-10 h-10`, font change is minor.
- Verify no Tailwind class conflicts (no other responsive `text-*` classes on these elements).

## 5. Manual QA Checklist

### iPhone Safari
1. Open the app on an iPhone (or Safari responsive mode at 390×844).
2. Navigate to the Share sheet — tap the email input. Confirm no zoom occurs. Type, blur, confirm viewport is normal.
3. Navigate to a job with Q&A — tap the question textarea. Confirm no zoom.
4. Open Transcription Settings — tap the keyterms textarea. Confirm no zoom.
5. Open Login / Signup — tap email and password fields. Confirm no zoom.
6. Open History — tap the search input and tag filter input. Confirm no zoom.
7. Open any Select dropdown (language selector). Confirm no zoom on trigger focus.
8. Pinch-to-zoom the page manually — confirm it still works (accessibility preserved).

### Android Chrome
1. Repeat steps 2–7. Android Chrome is less aggressive about auto-zoom but verify no regressions.

### Desktop Chrome / Firefox
1. Verify all inputs render at the smaller `text-sm` size as before.
2. Verify no visual or spacing changes on any page.

