import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "whatsaid:geo-check:v1";

type GeoResult = {
  allowed: boolean;
  reason?: string;
  country?: string | null;
};

type HookState = GeoResult & { loading: boolean };

let inflight: Promise<GeoResult> | null = null;
const listeners = new Set<(r: GeoResult) => void>();

function readCache(): GeoResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GeoResult;
  } catch {
    return null;
  }
}

function writeCache(result: GeoResult) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    /* ignore */
  }
}

/**
 * Wipes the cached geo result. Call this after sign-in / sign-out so the
 * next `useGeoCheck` consumer re-queries the edge function with the new
 * (or absent) JWT. Admin users get an instant bypass once authenticated.
 */
export function bustGeoCheckCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  inflight = null;
}

async function fetchGeo(): Promise<GeoResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("geo-check");
      if (error || !data) {
        const r: GeoResult = { allowed: false, reason: "unknown", country: null };
        writeCache(r);
        return r;
      }
      const r: GeoResult = {
        allowed: !!data.allowed,
        reason: data.reason,
        country: data.country ?? null,
      };
      writeCache(r);
      return r;
    } finally {
      inflight = null;
    }
  })();
  inflight.then((r) => listeners.forEach((cb) => cb(r)));
  return inflight;
}

/**
 * Force-refresh helper: clears the cache and re-queries. Active hook
 * consumers receive the new result via an internal subscription so the
 * UI updates immediately (e.g. when an admin logs in and the marketing
 * pages should drop the region banner).
 */
export function refreshGeoCheck() {
  bustGeoCheckCache();
  void fetchGeo();
}

/**
 * Client-side geo gate shared across landing, auth, and checkout entry points.
 * Result is cached per session to avoid repeated edge invocations.
 * The server-side enforcement (signup/login/checkout/webhook) remains the
 * authoritative gate — this hook only powers a consistent, friendly UI.
 */
export function useGeoCheck(): HookState {
  const cached = readCache();
  const [state, setState] = useState<HookState>(
    cached
      ? { ...cached, loading: false }
      : { allowed: true, loading: true },
  );

  useEffect(() => {
    let cancelled = false;
    const listener = (r: GeoResult) => {
      if (!cancelled) setState({ ...r, loading: false });
    };
    listeners.add(listener);

    if (!readCache()) {
      fetchGeo().then((r) => {
        if (!cancelled) setState({ ...r, loading: false });
      });
    }

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return state;
}
