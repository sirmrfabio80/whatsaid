/**
 * Paddle Checkout – initialise Paddle.js and open the overlay checkout.
 *
 * The client-side token is a *publishable* key and safe to include in source.
 *
 * Paddle.js is injected dynamically (not in index.html) so the ~50 KB script
 * is not loaded on pages that never open checkout (homepage, help, etc.).
 */

const PADDLE_CLIENT_TOKEN = "live_15b20ab2f8cd4d93060b2fc9510";
const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

let initialised = false;
let scriptPromise: Promise<void> | null = null;
let checkoutSuccessCallback: (() => void) | null = null;

function getPaddle(): any | null {
  if (typeof window !== "undefined" && (window as any).Paddle) {
    return (window as any).Paddle;
  }
  return null;
}

/** Inject Paddle.js once and resolve when ready. */
function loadPaddleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (getPaddle()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PADDLE_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Paddle.js failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = PADDLE_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Initialise Paddle.js (idempotent). Returns a promise that resolves when ready. */
export async function initPaddle(): Promise<void> {
  await loadPaddleScript();
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

export async function openCheckout(opts: {
  priceId: string;
  userId: string;
  email?: string;
  onSuccess?: () => void;
  successUrl?: string;
}): Promise<void> {
  await initPaddle();
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
