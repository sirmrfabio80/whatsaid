/**
 * Paddle Checkout – initialise Paddle.js and open the overlay checkout.
 *
 * The client-side token is a *publishable* key and safe to include in source.
 */

const PADDLE_CLIENT_TOKEN = "live_15b20ab2f8cd4d93060b2fc9510";

let initialised = false;
let checkoutSuccessCallback: (() => void) | null = null;

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
    eventCallback: (event: any) => {
      if (event?.name === "checkout.completed" && checkoutSuccessCallback) {
        const cb = checkoutSuccessCallback;
        checkoutSuccessCallback = null;
        cb();
      }
    },
  });
  initialised = true;
}

export function openCheckout(opts: {
  priceId: string;
  userId: string;
  email?: string;
  onSuccess?: () => void;
  successUrl?: string;
}): void {
  initPaddle();
  const paddle = getPaddle();
  if (!paddle) {
    console.error("[paddle-checkout] Paddle.js unavailable");
    return;
  }

  checkoutSuccessCallback = opts.onSuccess ?? null;

  paddle.Checkout.open({
    items: [{ priceId: opts.priceId, quantity: 1 }],
    customData: { user_id: opts.userId },
    customer: opts.email ? { email: opts.email } : undefined,
    settings: {
      displayMode: "overlay",
      theme: "dark",
      successUrl: opts.successUrl ?? `${window.location.origin}/convert?purchased=true`,
    },
  });
}