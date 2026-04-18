import { useEffect, useState } from "react";

/**
 * Returns `value` after `delayMs` of stability — useful for debouncing
 * search inputs, filter changes, and other rapidly-changing values that
 * gate expensive work (network calls, large recomputations).
 *
 * Behaviour:
 *  - On mount, returns the initial `value` synchronously.
 *  - Each subsequent change resets the timer; the debounced value updates
 *    only after `delayMs` has elapsed without further changes.
 *  - If `delayMs` is 0, updates synchronously on the next tick.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
