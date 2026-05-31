// Helper to build a consistent "revoked" JSON payload shared across all
// public share-view edge functions. Centralising it keeps the recipient UI
// in sync regardless of which endpoint detected the revocation first.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface RevokedPayload {
  error: "revoked";
  revoked_at: string | null;
  revoke_reason: string | null;
  revoked_by_label: string | null;
  sender_label: string | null;
  sender_email: string | null;
}

/**
 * Look up the sender's profile for the given share id and return a fully
 * populated revoked payload. Soft-fails: any DB issue still returns a
 * minimally-useful payload so the recipient sees the revoked state.
 */
export async function buildRevokedPayload(
  svc: SupabaseClient,
  share: {
    id?: string;
    shared_by?: string | null;
    revoked_at: string | null;
    revoke_reason?: string | null;
    revoked_by_label?: string | null;
  },
): Promise<RevokedPayload> {
  let sender_label: string | null = null;
  let sender_email: string | null = null;
  if (share.shared_by) {
    const { data: profile } = await svc
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", share.shared_by)
      .maybeSingle();
    sender_email = profile?.email ?? null;
    sender_label = profile?.display_name || profile?.email || null;
  }
  return {
    error: "revoked",
    revoked_at: share.revoked_at ?? null,
    revoke_reason: share.revoke_reason ?? null,
    revoked_by_label: share.revoked_by_label ?? null,
    sender_label,
    sender_email,
  };
}
