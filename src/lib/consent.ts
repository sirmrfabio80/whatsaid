/**
 * Dormant consent infrastructure. No category requires consent today
 * (see `requiresConsent()` in `cookie-inventory.ts`), but shipping the
 * API now means the day we add an analytics or marketing entry, the
 * cookie notice flips to a real consent dialog and call sites can read
 * `getConsent("analytics")` without further refactor.
 */
import { useEffect, useState } from "react";

export type ConsentCategory = "analytics" | "marketing";

const STORAGE_KEY = "ws.consent_v1";
const CURRENT_VERSION = 1;

interface ConsentRecord {
  version: number;
  ts: number;
  analytics: boolean;
  marketing: boolean;
}

function readRaw(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed?.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getConsent(category: ConsentCategory): boolean {
  const rec = readRaw();
  return rec ? Boolean(rec[category]) : false;
}

export function setConsent(category: ConsentCategory, granted: boolean): void {
  if (typeof window === "undefined") return;
  const current: ConsentRecord = readRaw() ?? {
    version: CURRENT_VERSION,
    ts: Date.now(),
    analytics: false,
    marketing: false,
  };
  current[category] = granted;
  current.ts = Date.now();
  current.version = CURRENT_VERSION;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    // Notify same-tab listeners (the `storage` event fires only across tabs).
    window.dispatchEvent(new CustomEvent("ws-consent-change"));
  } catch {
    // ignore quota errors — consent is best-effort UX state, not auth
  }
}

/**
 * React hook that re-renders when consent changes in this tab or another.
 */
export function useConsent(category: ConsentCategory): boolean {
  const [granted, setGranted] = useState<boolean>(() => getConsent(category));

  useEffect(() => {
    const sync = () => setGranted(getConsent(category));
    window.addEventListener("storage", sync);
    window.addEventListener("ws-consent-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("ws-consent-change", sync);
    };
  }, [category]);

  return granted;
}
