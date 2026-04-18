import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAdmin(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId: callerId, adminClient } = auth;

    // Parse & validate input
    const body = await req.json();
    const { email, packageId, method, language } = body as {
      email: string;
      packageId: string;
      method: "email" | "magic-link";
      language?: string;
    };
    const inviteLanguage = language || "en";

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creditMap: Record<string, number> = {
      "one-time": 1,
      "5-pack": 5,
      "20-pack": 20,
    };
    const credits = creditMap[packageId];
    if (!credits) {
      return new Response(JSON.stringify({ error: "Invalid package" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method !== "email" && method !== "magic-link") {
      return new Response(JSON.stringify({ error: "Invalid method" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists by email
    const { data: userByEmail } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    let magicLinkUrl: string | null = null;
    let creditsGrantedImmediately = false;

    if (userByEmail) {
      // User exists — grant credits immediately
      await adminClient.rpc("add_credits", {
        p_user_id: userByEmail.user_id,
        p_amount: credits,
        p_reason: `Invited by admin — ${packageId}`,
      });
      creditsGrantedImmediately = true;

      // Store as claimed invite
      await adminClient.from("pending_invites").insert({
        email: email.toLowerCase(),
        credits,
        package_id: packageId,
        invited_by: callerId,
        claimed: true,
        claimed_at: new Date().toISOString(),
        language: inviteLanguage,
      });
    } else {
      // Store pending invite
      await adminClient.from("pending_invites").insert({
        email: email.toLowerCase(),
        credits,
        package_id: packageId,
        invited_by: callerId,
        language: inviteLanguage,
      });

      if (method === "email") {
        const { error: inviteError } =
          await adminClient.auth.admin.inviteUserByEmail(email);
        if (inviteError) {
          return new Response(
            JSON.stringify({ error: inviteError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } else {
        const { data: linkData, error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: "magiclink",
            email,
          });
        if (linkError) {
          return new Response(
            JSON.stringify({ error: linkError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        magicLinkUrl = linkData?.properties?.action_link ?? null;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        creditsGrantedImmediately,
        magicLinkUrl,
        credits,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
