import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable `schedule(fn, delayMs)` function that runs `fn` after
 * `delayMs`. A pending call is automatically cancelled if the component
 * unmounts, or if `schedule` is called again before the previous timer fires.
 *
 * Use for one-shot UI delays (close a dialog after a success toast, reset
 * state after an exit animation). Do NOT use for value debouncing — use
 * `useDebouncedValue` for that.
 *
 * Returns:
 *  - `schedule(fn, delayMs)` — replaces any pending callback.
 *  - `cancel()`              — clears the pending callback if any.
 */
export function useDelayedCallback() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (fn: () => void, delayMs: number) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fn();
      }, delayMs);
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}
