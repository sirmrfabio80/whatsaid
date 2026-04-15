

## Problem

After a successful Paddle checkout, the code does a single `setTimeout(() => refreshCredits(), 3000)` which is a race condition — the webhook may not have processed yet in 3 seconds.

## Fix

Replace the single delayed refresh with a polling mechanism that checks for the updated credit balance repeatedly until it changes or a timeout is reached.

### Changes

**1. `src/pages/Pricing.tsx`** — Replace the `onSuccess` callback:
- Capture the current `creditBalance` before opening checkout
- In `onSuccess`, poll `refreshCredits()` every 2 seconds for up to 20 seconds
- Stop polling once the balance changes from the pre-purchase value
- Show a toast on success with the new balance, or a "credits arriving shortly" message if polling times out

**2. `src/lib/paddle-checkout.ts`** — Update the event listener approach:
- Use `Paddle.Initialize`'s `eventCallback` option instead of `Emitter.on` (which may not work reliably across Paddle SDK versions)
- Pass `eventCallback` during initialization to capture `checkout.completed` events

### Technical detail

The polling approach:
```
const priorBalance = creditBalance;
let attempts = 0;
const poll = setInterval(async () => {
  attempts++;
  await refreshCredits();
  // refreshCredits updates creditBalance in AuthContext
  // We'll re-read from credit_balances directly
  const { data } = await supabase
    .from("credit_balances")
    .select("balance")
    .eq("user_id", user.id)
    .single();
  if (data && data.balance > priorBalance) {
    clearInterval(poll);
    toast.success(t("pricing.purchaseSuccess"));
    refreshCredits(); // sync context
  } else if (attempts >= 10) {
    clearInterval(poll);
    toast.info("Credits arriving shortly — refresh if needed");
    refreshCredits();
  }
}, 2000);
```

This ensures the user sees the updated balance without needing a manual refresh.

