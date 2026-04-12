import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const url = new URL(req.url)

    // GET: validate token (no auth required)
    if (req.method === 'GET') {
      const token = url.searchParams.get('token')
      if (!token || token.length < 32) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
      const { data: share, error } = await serviceClient
        .from('transcript_shares')
        .select('id, recipient_email, claimed, expires_at, job_id, shared_by')
        .eq('token', token)
        .maybeSingle()

      if (error || !share) {
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (share.claimed) {
        return new Response(JSON.stringify({ error: 'already_claimed' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (new Date(share.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get job title for display
      const { data: job } = await serviceClient
        .from('jobs')
        .select('title, file_name')
        .eq('id', share.job_id)
        .maybeSingle()

      // Get sharer info
      const { data: sharerProfile } = await serviceClient
        .from('profiles')
        .select('display_name')
        .eq('user_id', share.shared_by)
        .maybeSingle()

      return new Response(JSON.stringify({
        valid: true,
        recipient_email: share.recipient_email,
        title: job?.title || job?.file_name?.replace(/\.[^.]+$/, '') || 'Transcript',
        shared_by_name: sharerProfile?.display_name || null,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST: claim the share (auth required)
    if (req.method === 'POST') {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { token } = await req.json()
      if (!token || token.length < 32) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

      // Fetch share record
      const { data: share, error: shareError } = await serviceClient
        .from('transcript_shares')
        .select('*')
        .eq('token', token)
        .maybeSingle()

      if (shareError || !share) {
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (share.claimed) {
        // If already claimed by this user, return the job
        if (share.claimed_by === user.id) {
          return new Response(JSON.stringify({ success: true, job_id: share.claimed_job_id }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'already_claimed' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (new Date(share.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'expired' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify email matches
      if (user.email?.toLowerCase() !== share.recipient_email.toLowerCase()) {
        return new Response(JSON.stringify({ error: 'email_mismatch', expected_email: share.recipient_email }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fetch original job
      const { data: originalJob, error: jobError } = await serviceClient
        .from('jobs')
        .select('*')
        .eq('id', share.job_id)
        .maybeSingle()

      if (jobError || !originalJob) {
        return new Response(JSON.stringify({ error: 'job_not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fetch original outputs
      const { data: originalOutputs } = await serviceClient
        .from('job_outputs')
        .select('output_type, content, custom_prompt')
        .eq('job_id', share.job_id)
        .order('created_at', { ascending: true })

      // Duplicate the job for the recipient
      const { data: newJob, error: newJobError } = await serviceClient
        .from('jobs')
        .insert({
          user_id: user.id,
          status: 'completed',
          file_name: originalJob.file_name,
          file_size_bytes: originalJob.file_size_bytes,
          duration_seconds: originalJob.duration_seconds,
          language_detected: originalJob.language_detected,
          language_selected: originalJob.language_selected,
          speech_model: originalJob.speech_model,
          speaker_names: originalJob.speaker_names,
          title: originalJob.title,
          short_summary: originalJob.short_summary,
          summary_language: originalJob.summary_language,
          recorded_at: originalJob.recorded_at,
          recorded_at_source: originalJob.recorded_at_source,
          metadata_apple_creationdate: originalJob.metadata_apple_creationdate,
          metadata_mvhd_creation: originalJob.metadata_mvhd_creation,
          metadata_file_lastmodified: originalJob.metadata_file_lastmodified,
          metadata_location_iso6709: originalJob.metadata_location_iso6709,
          location_label: originalJob.location_label,
          credits_charged: 0,
          audio_deleted_at: originalJob.audio_deleted_at || new Date().toISOString(),
        })
        .select('id')
        .single()

      if (newJobError || !newJob) {
        console.error('Failed to duplicate job', newJobError)
        return new Response(JSON.stringify({ error: 'duplication_failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Duplicate outputs
      if (originalOutputs && originalOutputs.length > 0) {
        const outputInserts = originalOutputs.map(o => ({
          job_id: newJob.id,
          output_type: o.output_type,
          content: o.content,
          custom_prompt: o.custom_prompt,
        }))
        const { error: outputError } = await serviceClient
          .from('job_outputs')
          .insert(outputInserts)
        if (outputError) {
          console.error('Failed to duplicate outputs', outputError)
          // Job was created but outputs failed — clean up
          await serviceClient.from('jobs').delete().eq('id', newJob.id)
          return new Response(JSON.stringify({ error: 'duplication_failed' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Mark share as claimed
      await serviceClient
        .from('transcript_shares')
        .update({
          claimed: true,
          claimed_by: user.id,
          claimed_job_id: newJob.id,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', share.id)

      return new Response(JSON.stringify({ success: true, job_id: newJob.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('claim-transcript-share error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
