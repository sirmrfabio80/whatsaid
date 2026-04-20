

## Add "You can leave this page" message to Convert page

Add a friendly informational message during processing to tell users they can safely leave the page and will receive a notification when their transcription is complete.

### Changes

**`src/pages/Convert.tsx`**

Add an info banner immediately after the step progress list (between the step list and the file info display), visible during active processing (when `step` is not `"failed"` or `"completed"`):

```tsx
{step !== "failed" && step !== "completed" && (
  <div className="flex items-start gap-2.5 p-4 rounded-xl bg-primary/5 border border-primary/20 text-body-sm max-w-md">
    <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
    <p className="text-foreground/90">
      {t("convert.canLeavePage")}
    </p>
  </div>
)}
```

Insert this after line 576 (after the step list `</div>` closing tag) and before the file info display at line 585.

**i18n locales**

Add the new message key to all three locale files:

- **`src/i18n/locales/en.json`** (after line 141):
  ```json
  "canLeavePage": "You can leave this page — we'll notify you when your transcription is ready.",
  ```

- **`src/i18n/locales/fr.json`** (after line 139):
  ```json
  "canLeavePage": "Vous pouvez quitter cette page — nous vous avertirons lorsque votre transcription sera prête.",
  ```

- **`src/i18n/locales/it.json`** (after line 139):
  ```json
  "canLeavePage": "Puoi lasciare questa pagina — ti avviseremo quando la trascrizione sarà pronta.",
  ```

### Visual result

During processing, users will see:

1. Status badge ("Processing")
2. Step progress list (Enhancing → Uploading → Transcribing → Summarising → Completed)
3. **New info banner** with bell/notification messaging
4. File name + duration
5. (No action buttons during active processing)

The banner uses:
- Soft primary-tinted background (`bg-primary/5`)
- Subtle primary border (`border-primary/20`)
- Info icon in primary color for visual consistency with notification bell
- Clear, friendly copy telling users they'll be notified

### Files changed

- `src/pages/Convert.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/fr.json`
- `src/i18n/locales/it.json`

