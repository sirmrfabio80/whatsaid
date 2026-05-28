import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

// AssemblyAI EU endpoint — must match _shared/assemblyai.ts (EU-pinned).
const ASSEMBLYAI_EU_BASE_URL = "https://api.eu.assemblyai.com";

/**
 * Fan-out delete to AssemblyAI for any of the user's transcripts that are
 * still flagged as not-yet-deleted. We log failures but do not block account
 * deletion (the row drops anyway; a sweeper picks up orphans later).
 */
async function deleteAssemblyAiTranscripts(
  jobs: Array<{ assemblyai_transcript_id: string | null; assemblyai_delete_status: string | null }>,
) {
  const key = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!key) return;
  const targets = jobs
    .filter((j) => j.assemblyai_transcript_id && j.assemblyai_delete_status !== "deleted")
    .map((j) => j.assemblyai_transcript_id as string);
  await Promise.allSettled(
    targets.map((id) =>
      fetch(`${ASSEMBLYAI_EU_BASE_URL}/v2/transcript/${id}`, {
        method: "DELETE",
        headers: { authorization: key },
      }).catch((e) => console.warn("[delete-account] assemblyai delete failed", id, e)),
    ),
  );
}

async function purgeBucketPrefix(
  admin: ReturnType<typeof createServiceClient>,
  bucket: string,
  prefix: string,
) {
  try {
    const { data: files } = await admin.storage.from(bucket).list(prefix);
    if (files && files.length > 0) {
      const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
      await admin.storage.from(bucket).remove(paths);
    }
  } catch (e) {
    console.warn(`[delete-account] purge ${bucket}/${prefix} failed`, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId, email } = auth;
    const admin = createServiceClient();

    // 1. Fan out AssemblyAI deletes BEFORE we drop the jobs rows (Art. 28(3)(g)).
    const { data: jobsFull } = await admin
      .from("jobs")
      .select("id, assemblyai_transcript_id, assemblyai_delete_status")
      .eq("user_id", userId);
    const jobIds = (jobsFull ?? []).map((j: { id: string }) => j.id);
    await deleteAssemblyAiTranscripts((jobsFull ?? []) as never);

    if (jobIds.length > 0) {
      // job_outputs → variants chain
      const { data: outputs } = await admin.from("job_outputs").select("id").in("job_id", jobIds);
      const outputIds = (outputs ?? []).map((o: { id: string }) => o.id);
      if (outputIds.length > 0) {
        await admin.from("job_output_variants").delete().in("job_output_id", outputIds);
      }
      await admin.from("job_outputs").delete().in("job_id", jobIds);
      await admin.from("job_tags").delete().in("job_id", jobIds);
      await admin.from("share_pdf_cache").delete().in("job_id", jobIds);
      await admin.from("recipient_notifications").delete().in("job_id", jobIds);
      await admin.from("jobs").delete().eq("user_id", userId);
    }

    // 2. Per-user PII tables (Art. 17 erasure — complete list).
    await admin.from("tags").delete().eq("user_id", userId);
    await admin.from("transcript_shares").delete().eq("shared_by", userId);
    await admin.from("share_artifact_log").delete().eq("user_id", userId);
    await admin.from("credit_transactions").delete().eq("user_id", userId);
    await admin.from("credit_balances").delete().eq("user_id", userId);
    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.from("async_jobs").delete().eq("user_id", userId);
    await admin.from("consent_events").delete().eq("user_id", userId);
    await admin.from("usage_events").delete().eq("user_id", userId);
    await admin.from("dsr_requests").delete().eq("user_id", userId);
    await admin.from("reviews").delete().eq("user_id", userId);
    await admin.from("help_faq_feedback").delete().eq("user_id", userId);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("pending_invites").delete().eq("invited_by", userId);

    // 3. Email-keyed records (keyed by email, not user_id).
    if (email) {
      await admin.from("email_unsubscribe_tokens").delete().eq("email", email);
      // suppressed_emails intentionally retained: honouring an unsubscribe
      // is a continuing legitimate interest (PECR + Art. 6(1)(f)). The row
      // contains only the address + reason, no other PII.
    }

    // 4. Purge ALL user-prefixed buckets.
    for (const bucket of ["avatars", "shared-pdfs", "exports", "temp-audio", "dsr-exports"]) {
      await purgeBucketPrefix(admin, bucket, userId);
    }

    // 5. Delete auth user last.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

