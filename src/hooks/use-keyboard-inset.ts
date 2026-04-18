import { useEffect } from "react";

/**
 * Tracks the iOS/Android virtual keyboard via `window.visualViewport` and
 * exposes its height as the CSS variable `--keyboard-inset` on `<html>`.
 *
 * Bottom-anchored UI (sheets, drawers, sticky inputs) can read the variable
 * and lift itself above the keyboard, e.g.:
 *   style={{ bottom: "var(--keyboard-inset, 0px)" }}
 *   className="pb-[env(safe-area-inset-bottom)]"
 *
 * Why visualViewport?
 *  - On iOS Safari the layout viewport does NOT shrink when the keyboard
 *    opens, so `100vh` / `bottom: 0` stays anchored under the keyboard.
 *  - `window.visualViewport` reports the actually-visible region.
 *  - We listen to both `resize` and `scroll` because iOS fires `scroll`
 *    while the keyboard animates in/out.
 *
 * Mount this once near the app root.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const root = document.documentElement;
    if (!vv) {
      root.style.setProperty("--keyboard-inset", "0px");
      return;
    }

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      root.style.setProperty("--keyboard-inset", "0px");
    };
  }, []);
}

/** Component wrapper for places where a hook can't be used directly. */
export function KeyboardInsetTracker() {
  useKeyboardInset();
  return null;
}
