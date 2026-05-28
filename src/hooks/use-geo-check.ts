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

async function fetchGeo(): Promise<GeoResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("geo-check");
      if (error || !data) {
        // Fail closed: treat unknown as blocked, but mark reason so UI can hint.
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
  return inflight;
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
    if (cached) return;
    let cancelled = false;
    fetchGeo().then((r) => {
      if (!cancelled) setState({ ...r, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
