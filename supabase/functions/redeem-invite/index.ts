import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId, email: userEmail } = auth;

    if (!userEmail) {
      return new Response(JSON.stringify({ error: "No email in token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createServiceClient();

    // Atomically claim unclaimed invites
    const { data: claimed, error: claimError } = await adminClient
      .from("pending_invites")
      .update({ claimed: true, claimed_at: new Date().toISOString() })
      .eq("email", userEmail.toLowerCase())
      .eq("claimed", false)
      .select("id, credits, package_id, language");

    if (claimError) {
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claimed || claimed.length === 0) {
      return new Response(
        JSON.stringify({ success: true, totalCredits: 0, invitesRedeemed: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Add credits for each claimed invite
    let totalCredits = 0;
    for (const invite of claimed) {
      await adminClient.rpc("add_credits", {
        p_user_id: userId,
        p_amount: invite.credits,
        p_reason: `Invite redeemed — ${invite.package_id}`,
      });
      totalCredits += invite.credits;
    }

    // Set needs_password_setup flag and ui_language from invite
    const inviteLanguage = claimed[0]?.language || "en";
    await adminClient
      .from("profiles")
      .update({ needs_password_setup: true, ui_language: inviteLanguage })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        success: true,
        totalCredits,
        invitesRedeemed: claimed.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
