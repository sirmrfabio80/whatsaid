import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Paddle signature verification (Paddle Billing / v2 webhooks)
// Uses HMAC-SHA256 with the webhook secret to verify the ts;h1 signature.
// Docs: https://developer.paddle.com/webhooks/signature-verification
// ---------------------------------------------------------------------------

async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(";").map((p) => {
        const [k, ...v] = p.split("=");
        return [k, v.join("=")];
      })
    );
    const ts = parts["ts"];
    const h1 = parts["h1"];
    if (!ts || !h1) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${ts}:${rawBody}`)
    );
    const computed = Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === h1;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Product → credits mapping
// Keyed by Paddle Price ID — fill in once you create products in Paddle.
// ---------------------------------------------------------------------------

const PRICE_TO_CREDITS: Record<string, number> = {
  "pri_01kp91g9954gq9a4k080fdgedw": 1,   // One-time transcript
  "pri_01kp91hv62g2nx9jxqta2766hf": 5,   // 5-credit pack
  "pri_01kp91m77g15bhgemezzcsvh2n": 20,  // 20-credit pack
};

// Fallback: derive credits from product custom_data if price ID not mapped
function creditsFromEvent(eventData: any): number {
  // Check mapped price IDs first
  const items = eventData?.items ?? [];
  for (const item of items) {
    const priceId = item?.price?.id;
    if (priceId && PRICE_TO_CREDITS[priceId]) {
      return PRICE_TO_CREDITS[priceId];
    }
  }

  // Fallback: check custom_data.credits on the transaction
  const customCredits = eventData?.custom_data?.credits;
  if (customCredits && typeof customCredits === "number") {
    return customCredits;
  }

  // Fallback: check custom_data on line items
  for (const item of items) {
    const itemCredits = item?.price?.custom_data?.credits;
    if (itemCredits) return Number(itemCredits);
  }

  console.error("[paddle-webhook] Could not determine credits from event", eventData);
  return 0;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    console.error("[paddle-webhook] PADDLE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const rawBody = await req.text();

  // Verify signature
  const signature = req.headers.get("paddle-signature") ?? "";
  const valid = await verifyPaddleSignature(rawBody, signature, WEBHOOK_SECRET);
  if (!valid) {
    console.warn("[paddle-webhook] Invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = event?.event_type;
  console.log(`[paddle-webhook] Received event: ${eventType}`);

  // Only process completed transactions
  if (eventType === "transaction.completed") {
    const data = event.data;
    const paddleTransactionId = data?.id;
    const userId = data?.custom_data?.user_id;

    if (!userId) {
      console.error("[paddle-webhook] No user_id in custom_data", data?.custom_data);
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credits = creditsFromEvent(data);
    if (credits <= 0) {
      console.error("[paddle-webhook] Could not determine credits", paddleTransactionId);
      return new Response(JSON.stringify({ error: "Could not determine credits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add credits atomically
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: newBalance, error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount: credits,
      p_reason: `paddle:${paddleTransactionId}`,
      p_stripe_session_id: paddleTransactionId, // reusing column for paddle tx id
    });

    if (error) {
      console.error("[paddle-webhook] add_credits failed", error);
      return new Response(JSON.stringify({ error: "Failed to add credits" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `[paddle-webhook] Added ${credits} credits to user ${userId}. New balance: ${newBalance}`
    );

    return new Response(
      JSON.stringify({ success: true, credits, newBalance }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Acknowledge other event types
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
