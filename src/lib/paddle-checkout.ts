/**
 * Paddle Checkout – initialise Paddle.js and open the overlay checkout.
 *
 * The client-side token is a *publishable* key and safe to include in source.
 */

const PADDLE_CLIENT_TOKEN = "live_15b20ab2f8cd4d93060b2fc9510";

let initialised = false;

function getPaddle(): any | null {
  if (typeof window !== "undefined" && (window as any).Paddle) {
    return (window as any).Paddle;
  }
  return null;
}

/** Initialise Paddle.js (idempotent). */
export function initPaddle(): void {
  if (initialised) return;
  const paddle = getPaddle();
  if (!paddle) {
    console.warn("[paddle-checkout] Paddle.js not loaded");
    return;
  }
  paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    // For sandbox testing, uncomment:
    // environment: "sandbox",
  });
  initialised = true;
}

/**
 * Open the Paddle checkout overlay for a given price.
 *
 * @param priceId  Paddle Price ID (pri_xxx)
 * @param userId   Authenticated user's UUID — passed as custom_data so the
 *                 webhook can credit the correct account.
 * @param email    Pre-fill the customer email field (optional).
 * @param onSuccess Called after a successful purchase.
 */
export function openCheckout(opts: {
  priceId: string;
  userId: string;
  email?: string;
  onSuccess?: () => void;
}): void {
  initPaddle();
  const paddle = getPaddle();
  if (!paddle) {
    console.error("[paddle-checkout] Paddle.js unavailable");
    return;
  }

  paddle.Checkout.open({
    items: [{ priceId: opts.priceId, quantity: 1 }],
    customData: { user_id: opts.userId },
    customer: opts.email ? { email: opts.email } : undefined,
    settings: {
      displayMode: "overlay",
      theme: "dark",
      successUrl: `${window.location.origin}/convert?purchased=true`,
    },
  });

  // Listen for completed event
  if (opts.onSuccess) {
    const handler = (event: any) => {
      if (event?.name === "checkout.completed") {
        opts.onSuccess?.();
        paddle.Emitter?.off?.("checkout.completed", handler);
      }
    };
    paddle.Emitter?.on?.("checkout.completed", handler);
  }
}
