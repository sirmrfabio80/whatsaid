import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    // Check admin role server-side
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse & validate input
    const body = await req.json();
    const { email, packageId, method } = body as {
      email: string;
      packageId: string;
      method: "email" | "magic-link";
    };

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

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    // Search by email
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
      });
    } else {
      // Store pending invite
      await adminClient.from("pending_invites").insert({
        email: email.toLowerCase(),
        credits,
        package_id: packageId,
        invited_by: callerId,
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
