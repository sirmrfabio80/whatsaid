import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { ADMIN_NOTIFY_EMAIL } from "../_shared/constants.ts";

async function notifyAdminOfPurchase(input: {
  userEmail: string | null;
  userId: string;
  credits: number;
  amount?: string;
  currency?: string;
  transactionId: string;
  newBalance?: number;
  /** When set, signals a Reg.37 bypass anomaly rather than a normal purchase. */
  bypassReason?: string;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;
  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: "admin-credit-purchase",
          recipientEmail: ADMIN_NOTIFY_EMAIL,
          idempotencyKey: `admin-purchase-${input.transactionId}${input.bypassReason ? ":" + input.bypassReason : ""}`,
          templateData: {
            userEmail: input.userEmail ?? "(unknown)",
            bypassReason: input.bypassReason,
            userId: input.userId,
            credits: input.credits,
            amount: input.amount,
            currency: input.currency,
            transactionId: input.transactionId,
            newBalance: input.newBalance,
            purchasedAt: new Date().toISOString(),
          },
        }),
      }
    );
    if (!res.ok) {
      console.error(
        "[paddle-webhook] admin purchase notify non-ok",
        res.status,
        await res.text()
      );
    }
  } catch (err) {
    console.error("[paddle-webhook] admin purchase notify error", err);
  }
}

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

  // (env vars are read inside createServiceClient() when needed)

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

    // UK-only billing guard. WhatSaid is currently available to UK residents
    // only; refuse to grant credits for any non-GB billing country.
    const billingCountry: string | undefined =
      data?.customer?.address?.country_code ??
      data?.billing_details?.address?.country_code ??
      data?.address?.country_code;
    if (!billingCountry || billingCountry.toUpperCase() !== "GB") {
      console.warn(
        `[paddle-webhook] Non-GB billing country=${billingCountry ?? "unknown"} tx=${paddleTransactionId} user=${userId} — credits not granted`,
      );
      return new Response(
        JSON.stringify({ ignored: "non_gb_billing", billingCountry: billingCountry ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reg. 37 consent verification. Block credit grant if the checkout was
    // not preceded by a recorded consent_id linked to this user. We alert
    // admins on any bypass so we can investigate (likely a stale client
    // bundle or someone calling Paddle outside the official flow).
    const consentId: string | undefined = data?.custom_data?.consent_id;
    const consentVersion: string | undefined = data?.custom_data?.consent_version;
    const supabaseGuard = createServiceClient();
    if (!consentId) {
      console.error(
        `[paddle-webhook] Missing consent_id tx=${paddleTransactionId} user=${userId} — refusing credit grant`,
      );
      notifyAdminOfPurchase({
        userEmail: data?.customer?.email ?? null,
        userId,
        credits: 0,
        transactionId: paddleTransactionId,
        bypassReason: "missing_consent_id",
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ignored: "missing_consent_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: consentRow, error: consentErr } = await supabaseGuard
      .from("consent_events")
      .select("id, user_id, version")
      .eq("id", consentId)
      .maybeSingle();
    if (consentErr || !consentRow || consentRow.user_id !== userId) {
      console.error(
        `[paddle-webhook] Consent verification failed tx=${paddleTransactionId} user=${userId} consent=${consentId}`,
        consentErr,
      );
      notifyAdminOfPurchase({
        userEmail: data?.customer?.email ?? null,
        userId,
        credits: 0,
        transactionId: paddleTransactionId,
        bypassReason: "consent_mismatch",
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ignored: "consent_mismatch" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (consentVersion && consentRow.version !== consentVersion) {
      console.error(
        `[paddle-webhook] Consent version drift tx=${paddleTransactionId} stored=${consentRow.version} claimed=${consentVersion} — refusing credit grant (Art. 7(2) — buyer agreed to a different version)`,
      );
      notifyAdminOfPurchase({
        userEmail: data?.customer?.email ?? null,
        userId,
        credits: 0,
        transactionId: paddleTransactionId,
        bypassReason: `consent_version_drift:stored=${consentRow.version}:claimed=${consentVersion}`,
      }).catch(() => {});
      return new Response(
        JSON.stringify({ ignored: "consent_version_drift" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
    const supabase = createServiceClient();
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

    // Look up buyer email for admin notification (best-effort)
    let buyerEmail: string | null = data?.customer?.email ?? null;
    if (!buyerEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", userId)
        .maybeSingle();
      buyerEmail = profile?.email ?? null;
    }

    const totals = data?.details?.totals ?? data?.totals ?? {};
    const amount =
      typeof totals?.grand_total === "string"
        ? (Number(totals.grand_total) / 100).toFixed(2)
        : undefined;
    const currency = data?.currency_code ?? totals?.currency_code;

    // Fire-and-forget admin notification
    notifyAdminOfPurchase({
      userEmail: buyerEmail,
      userId,
      credits,
      amount,
      currency,
      transactionId: paddleTransactionId,
      newBalance: typeof newBalance === "number" ? newBalance : undefined,
    }).catch((e) =>
      console.error("[paddle-webhook] admin notify dispatch failed", e)
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
