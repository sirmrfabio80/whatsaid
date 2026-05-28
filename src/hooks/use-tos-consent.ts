import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CONSENT_TYPE = "tos_uploader_warranty";

export type TosConsentStatus =
  | { state: "loading" }
  | { state: "anonymous" }
  | { state: "current"; acceptedVersion: string; acceptedAt: string }
  | { state: "outdated"; latestVersion: string; acceptedVersion: string; acceptedAt: string }
  | { state: "missing"; latestVersion: string }
  | { state: "error"; message: string };

export function useTosConsent() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TosConsentStatus>({ state: "loading" });
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setStatus({ state: "anonymous" });
      return;
    }
    setStatus({ state: "loading" });
    try {
      const [{ data: latest, error: vErr }, { data: accepted, error: aErr }] = await Promise.all([
        supabase
          .from("consent_versions")
          .select("version, effective_from")
          .eq("consent_type", CONSENT_TYPE)
          .is("effective_to", null)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("consent_events")
          .select("version, created_at")
          .eq("user_id", user.id)
          .eq("consent_type", CONSENT_TYPE)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (vErr) throw vErr;
      if (aErr) throw aErr;
      if (!latest) {
        setStatus({ state: "error", message: "No active terms version" });
        return;
      }
      if (!accepted) {
        setStatus({ state: "missing", latestVersion: latest.version });
        return;
      }
      if (accepted.version === latest.version) {
        setStatus({
          state: "current",
          acceptedVersion: accepted.version,
          acceptedAt: accepted.created_at,
        });
      } else {
        setStatus({
          state: "outdated",
          latestVersion: latest.version,
          acceptedVersion: accepted.version,
          acceptedAt: accepted.created_at,
        });
      }
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to load consent status",
      });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const reaccept = useCallback(async () => {
    if (!user) return { ok: false, error: "Not signed in" };
    setRecording(true);
    try {
      const { error } = await supabase.functions.invoke("record-tos-acceptance");
      if (error) throw error;
      await load();
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not record acceptance";
      return { ok: false as const, error: message };
    } finally {
      setRecording(false);
    }
  }, [user, load]);

  return { status, reaccept, recording, refresh: load };
}
