

## Plan: Inline ghost autocomplete in ShareButton

### 1. Fetch & cache previous recipients
- New state in `ShareButton`: `recentRecipients: string[]`.
- Fetch inside `handleOpenChange(true)` (once per open). Skip if already loaded for this session of the popover, or always refetch on open — refetch on open keeps it simple and small.
- Query: `supabase.from('transcript_shares').select('recipient_email, created_at').eq('shared_by', user.id).order('created_at', { ascending: false }).limit(200)`.
- Get user via `supabase.auth.getUser()`. If no user, skip silently.
- Dedupe in JS: lowercase + trim, keep first occurrence (most recent), slice to 50. Store **original-cased** first-occurrence string (so the ghost preserves the casing the user actually used last time).
- Reset `recentRecipients` to `[]` on close alongside existing reset.

### 2. Derive the single inline suggestion
- Pure helper in `ShareContent`:
  ```
  const suggestion = useMemo(() => {
    const q = email.trim();
    if (!q) return "";
    const qLower = q.toLowerCase();
    const match = recentRecipients.find(r => r.toLowerCase().startsWith(qLower) && r.toLowerCase() !== qLower);
    if (!match) return "";
    return match.slice(q.length); // only the tail to render as ghost
  }, [email, recentRecipients]);
  ```
- No suggestion when: empty input, exact match (case-insensitive), no startsWith match.
- Recompute on every keystroke automatically via `useMemo`.

### 3. Render ghost completion inside the existing field
- Wrap the existing `<Input>` in a `relative` container.
- Render a visually-identical, absolutely-positioned `<div>` overlay behind/over the input that mirrors the input's text styling (font, size, padding, line-height).
- Overlay layout: two inline spans — the typed part rendered transparent (just to push the ghost to the correct x-offset), and the ghost tail rendered in `text-muted-foreground/60`.
  ```
  <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-base md:text-sm">
    <span className="invisible whitespace-pre">{email}</span>
    <span className="text-muted-foreground/60 whitespace-pre">{suggestion}</span>
  </div>
  ```
- Input keeps `bg-transparent` so overlay is visible. Real text colour stays normal because the input renders on top of the invisible mirror span.
- Overlay only renders when `suggestion` is non-empty AND input is focused (track `focused` state via `onFocus`/`onBlur`) — avoids ghost lingering after blur.
- Padding/font must exactly match `Input`'s `h-10 px-3 py-2 text-base md:text-sm rounded-lg` so the ghost aligns pixel-perfectly. No border on overlay.

### 4. Space-to-accept interaction
- Extend existing `onKeyDown`:
  - If `e.key === " "` AND `suggestion` is non-empty AND caret is at end of input (`e.currentTarget.selectionStart === email.length`) → `e.preventDefault()`, `setEmail(email + suggestion)`, do not insert space.
  - Existing Enter behaviour preserved (calls `handleSendEmail`).
  - Backspace and normal typing: no special handling — `useMemo` will recompute and the suggestion will update or vanish naturally.
  - Paste: no special handling — `onChange` fires, suggestion recomputes from new value.
- After accepting, suggestion becomes empty (exact match), ghost disappears.

### 5. Regression checks (desktop + mobile)
- Desktop Popover: ghost aligns inside input, Space accepts, Enter still sends, validation/disabled states still gate send buttons, focus management on close still works.
- Mobile Sheet: same input is used; verify ghost alignment with `text-base` (not `md:text-sm`) and that virtual keyboard's autocorrect/space behaviour does not double-insert. iOS Safari sometimes inserts a period on double-space — only a single Space triggers acceptance, so first Space accepts before the OS shortcut fires.
- Empty `recentRecipients` → no overlay ever renders → zero visual change vs. today.
- Suggestion must not appear once input fully equals a recipient (case-insensitive) — covered by the