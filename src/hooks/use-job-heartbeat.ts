import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * While the client is doing real work for a job (preparing/enhancing/uploading),
 * bump `jobs.updated_at` every 60s so the stale-job watchdog (which uses
 * `updated_at < cutoff`) cannot mistake a slow-but-live tab for a dead one.
 *
 * Also writes the current local `processing_stage` so admins/poller can see
 * where the user actually is (matches the UI step).
 *
 * Heartbeat stops automatically when:
 *   - the hook unmounts
 *   - `jobId` becomes null
 *   - `stage` becomes null (= we're done with client work)
 */
export function useJobHeartbeat(
  jobId: string | null,
  stage: "preparing" | "enhancing" | "uploading" | "detecting_language" | null,
  intervalMs: number = 60_000,
) {
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    if (!jobId || !stage) return;

    let cancelled = false;

    const beat = async () => {
      const currentStage = stageRef.current;
      if (cancelled || !currentStage) return;
      try {
        await supabase
          .from("jobs")
          .update({
            processing_stage: currentStage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch (err) {
        // Best-effort — don't break the upload flow if a heartbeat fails.
        console.warn("[heartbeat] write failed:", err);
      }
    };

    const interval = setInterval(beat, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, stage, intervalMs]);
}
