/**
 * dsr-export — UK GDPR Art. 15 (access) + Art. 20 (portability).
 *
 * Builds a ZIP of every piece of personal data WhatSaid holds for the calling
 * user, uploads it to the private `dsr-exports` bucket, writes a `dsr_requests`
 * audit row, and returns a 7-day signed URL.
 *
 * Auth: requireAuth + own-user only.
 * Quota: 2 per user per 24h, 12 per lifetime (via check_and_record_usage).
 * Storage: `dsr-exports/{user_id}/{request_id}.zip`. Opportunistic cleanup
 *   inside this fn deletes any of the caller's own ZIPs older than 7 days
 *   on each invocation — keeps the bucket trimmed without a separate cron.
 */
import JSZip from "https://esm.sh/jszip@3.10.1";
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import { enforceQuota } from "../_shared/quota.ts";
import { buildDsrManifest, type DsrFixtures } from "./builder.ts";

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId, email } = auth;
    const admin = createServiceClient();

    // Quota: 2/day, 12/lifetime. The RPC records the event on success.
    const dayBlocked = await enforceQuota(admin, {
      userId,
      action: "dsr_export",
      scope: "user_day",
      window: "1 day",
      limit: 2,
    });
    if (dayBlocked) return dayBlocked;
    const lifetimeBlocked = await enforceQuota(admin, {
      userId,
      action: "dsr_export",
      scope: "user_lifetime",
      limit: 12,
    });
    if (lifetimeBlocked) return lifetimeBlocked;

    // -- Opportunistic cleanup of this user's expired ZIPs ----------------
    try {
      const cutoffMs = Date.now() - SIGNED_URL_TTL_SECONDS * 1000;
      const { data: existing } = await admin.storage.from("dsr-exports").list(userId);
      const stale = (existing ?? [])
        .filter((o) => {
          const created = o.created_at ? Date.parse(o.created_at) : 0;
          return created && created < cutoffMs;
        })
        .map((o) => `${userId}/${o.name}`);
      if (stale.length > 0) {
        await admin.storage.from("dsr-exports").remove(stale);
      }
    } catch (err) {
      // Non-fatal — log and continue.
      console.warn("[dsr-export] cleanup failed", err);
    }

    // -- Fetch the user's data --------------------------------------------
    const [
      profileRes, balanceRes, txRes, consentRes,
      jobsRes, sharesRes, usageRes, notifRes,
    ] = await Promise.all([
      admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("credit_balances").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("credit_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      admin.from("consent_events").select("*").eq("user_id", userId).order("accepted_at", { ascending: false }),
      admin.from("jobs").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      admin.from("transcript_shares").select("*").eq("shared_by", userId).order("created_at", { ascending: false }),
      admin.from("usage_events").select("*").eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
        .order("created_at", { ascending: false }),
      admin.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);

    const jobs = jobsRes.data ?? [];
    const jobIds = jobs.map((j: { id: string }) => j.id);
    let outputs: Array<Record<string, unknown>> = [];
    let variants: Array<Record<string, unknown>> = [];
    let jobTagRows: Array<{ job_id: string; tag_id: string }> = [];
    let tagRows: Array<Record<string, unknown>> = [];

    if (jobIds.length > 0) {
      const [outRes, jtRes] = await Promise.all([
        admin.from("job_outputs").select("*").in("job_id", jobIds),
        admin.from("job_tags").select("job_id, tag_id").in("job_id", jobIds),
      ]);
      outputs = outRes.data ?? [];
      jobTagRows = jtRes.data ?? [];
      const outputIds = outputs.map((o) => String(o.id));
      if (outputIds.length > 0) {
        const { data: varData } = await admin
          .from("job_output_variants").select("*").in("job_output_id", outputIds);
        variants = varData ?? [];
      }
      const tagIds = [...new Set(jobTagRows.map((j) => j.tag_id))];
      if (tagIds.length > 0) {
        const { data: tData } = await admin.from("tags").select("*").in("id", tagIds);
        tagRows = tData ?? [];
      }
    }

    const outputsByJob: Record<string, Array<Record<string, unknown>>> = {};
    for (const o of outputs) {
      const jid = String(o.job_id);
      (outputsByJob[jid] ??= []).push(o);
    }
    const variantsByOutput: Record<string, Array<Record<string, unknown>>> = {};
    for (const v of variants) {
      const oid = String(v.job_output_id);
      (variantsByOutput[oid] ??= []).push(v);
    }
    const tagsById = new Map(tagRows.map((t) => [String(t.id), t]));
    const tagsByJob: Record<string, Array<Record<string, unknown>>> = {};
    for (const j of jobTagRows) {
      const tag = tagsById.get(j.tag_id);
      if (tag) (tagsByJob[j.job_id] ??= []).push(tag);
    }

    const fixtures: DsrFixtures = {
      profile: profileRes.data ?? null,
      creditBalance: balanceRes.data ?? null,
      creditTransactions: txRes.data ?? [],
      consentEvents: consentRes.data ?? [],
      jobs,
      jobOutputsByJob: outputsByJob,
      variantsByOutput,
      tagsByJob,
      sharesSent: sharesRes.data ?? [],
      usageEvents: usageRes.data ?? [],
      notifications: notifRes.data ?? [],
    };

    const generatedAt = new Date().toISOString();
    const manifest = buildDsrManifest(fixtures, { generatedAt, userId, userEmail: email });

    // -- Build the ZIP -----------------------------------------------------
    const zip = new JSZip();
    for (const entry of manifest) {
      zip.file(entry.path, entry.content);
    }
    const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    // -- Upload + sign -----------------------------------------------------
    const requestId = crypto.randomUUID();
    const storagePath = `${userId}/${requestId}.zip`;
    const { error: upErr } = await admin.storage
      .from("dsr-exports")
      .upload(storagePath, zipBytes, {
        contentType: "application/zip",
        upsert: false,
      });
    if (upErr) {
      console.error("[dsr-export] upload failed", upErr);
      return new Response(JSON.stringify({ error: "Export upload failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signErr } = await admin.storage
      .from("dsr-exports")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed) {
      console.error("[dsr-export] signed url failed", signErr);
      return new Response(JSON.stringify({ error: "Signed URL failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    // -- Audit row ---------------------------------------------------------
    await admin.from("dsr_requests").insert({
      id: requestId,
      user_id: userId,
      kind: "portability",
      status: "fulfilled",
      requested_via: "self_service",
      export_storage_path: storagePath,
      export_expires_at: expiresAt,
      fulfilled_at: new Date().toISOString(),
      notes: `bytes=${zipBytes.byteLength}; jobs=${jobs.length}`,
    });

    return new Response(
      JSON.stringify({
        request_id: requestId,
        signed_url: signed.signedUrl,
        expires_at: expiresAt,
        bytes: zipBytes.byteLength,
        job_count: jobs.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dsr-export] unhandled", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
