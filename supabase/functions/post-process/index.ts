import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit exceeded. Please try again later.");
  }
  if (res.status === 402) {
    throw new Error("AI credits exhausted. Please add funds.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error [${res.status}]: ${t}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { job_id, custom_prompt } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Read the transcript
    const { data: transcriptRow, error: txError } = await supabase
      .from("job_outputs")
      .select("content")
      .eq("job_id", job_id)
      .eq("output_type", "transcript")
      .single();

    if (txError || !transcriptRow?.content) {
      throw new Error(`Transcript not found for job ${job_id}: ${txError?.message}`);
    }

    const transcript = transcriptRow.content;
    console.log(`[post-process] Processing job ${job_id}, transcript length: ${transcript.length}`);

    // 2. Generate summary with key actions
    const summarySystemPrompt = `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries for business professionals.

Your output must include:
1. A concise summary (2-4 paragraphs) covering the main topics discussed
2. A "Key Points" section as a bullet list of the most important information
3. A "Key Actions" section as a bullet list of action items, decisions made, or next steps identified

Use plain text with markdown formatting. Be factual and precise. Do not invent information not present in the transcript.`;

    const summaryPrompt = `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;

    const summaryContent = await callAI(LOVABLE_API_KEY, summarySystemPrompt, summaryPrompt);
    console.log(`[post-process] Summary generated for job ${job_id}`);

    // 3. Insert summary output
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: "summary",
      content: summaryContent,
    });

    // 4. Generate custom prompt output (if provided)
    if (custom_prompt && custom_prompt.trim()) {
      const customSystemPrompt = `You are a professional analysis assistant. The user has provided a transcript and a custom instruction. Apply the instruction to the transcript and produce a clear, well-structured response. Be factual and precise. Do not invent information not present in the transcript.`;

      const customUserPrompt = `Instruction: ${custom_prompt}\n\nTranscript:\n${transcript}`;

      const customContent = await callAI(LOVABLE_API_KEY, customSystemPrompt, customUserPrompt);
      console.log(`[post-process] Custom output generated for job ${job_id}`);

      await supabase.from("job_outputs").insert({
        job_id,
        output_type: "custom",
        content: customContent,
        custom_prompt: custom_prompt,
      });
    }

    // 5. Mark job as completed
    await supabase
      .from("jobs")
      .update({ status: "completed" })
      .eq("id", job_id);

    console.log(`[post-process] Job ${job_id} completed`);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[post-process] Error:`, error);

    // Try to mark job as failed
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const body = await req.clone().json().catch(() => ({}));
      if (body.job_id) {
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", body.job_id);
      }
    } catch {
      // ignore cleanup errors
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
