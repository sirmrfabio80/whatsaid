import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-share-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // GET = validate token, POST = claim
    if (req.method === 'GET' || (req.method === 'POST' && req.headers.get('x-share-token'))) {
      // Validate token
      const token = req.headers.get('x-share-token') || ''
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: share } = await serviceClient
        .from('transcript_shares')
        .select('*, jobs(title, file_name)')
        .eq('token', token)
        .maybeSingle()

      if (!share) {
        return new Response(JSON.stringify({ error: 'This link is not valid or has expired.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get sender email
      const { data: senderProfile } = await serviceClient
        .from('profiles')
        .select('email')
        .eq('user_id', share.shared_by)
        .maybeSingle()

      const job = share.jobs as any
      return new Response(JSON.stringify({
        title: job?.title || job?.file_name?.replace(/\.[^.]+$/, '') || 'Transcript',
        senderEmail: senderProfile?.email || 'someone',
        recipientEmail: share.recipient_email,
        expired: new Date(share.expires_at) < new Date(),
        alreadyClaimed: share.claimed,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // POST = claim the share
    const authHeader = req.headers.get('Authorization') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch share
    const { data: share } = await serviceClient
      .from('transcript_shares')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (!share) {
      return new Response(JSON.stringify({ error: 'This link is not valid.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (share.claimed) {
      return new Response(JSON.stringify({ error: 'This transcript has already been claimed.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify email match
    const userEmail = user.email?.toLowerCase().trim()
    if (userEmail !== share.recipient_email.toLowerCase().trim()) {
      return new Response(JSON.stringify({
        error: `This transcript was shared with ${share.recipient_email}. Please sign in with that email address.`
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch original job
    const { data: originalJob } = await serviceClient
      .from('jobs')
      .select('*')
      .eq('id', share.job_id)
      .maybeSingle()

    if (!originalJob) {
      return new Response(JSON.stringify({ error: 'Original transcript no longer exists.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Duplicate job
    const { data: newJob, error: insertError } = await serviceClient
      .from('jobs')
      .insert({
        user_id: user.id,
        file_name: originalJob.file_name,
        file_size_bytes: originalJob.file_size_bytes,
        duration_seconds: originalJob.duration_seconds,
        language_detected: originalJob.language_detected,
        language_selected: originalJob.language_selected,
        title: originalJob.title,
        short_summary: originalJob.short_summary,
        summary_language: originalJob.summary_language,
        speaker_names: originalJob.speaker_names,
        speech_model: originalJob.speech_model,
        recorded_at: originalJob.recorded_at,
        recorded_at_source: originalJob.recorded_at_source,
        metadata_apple_creationdate: originalJob.metadata_apple_creationdate,
        metadata_mvhd_creation: originalJob.metadata_mvhd_creation,
        metadata_file_lastmodified: originalJob.metadata_file_lastmodified,
        metadata_location_iso6709: originalJob.metadata_location_iso6709,
        location_label: originalJob.location_label,
        status: 'completed',
        credits_charged: 0,
        audio_deleted_at: originalJob.audio_deleted_at || new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !newJob) {
      console.error('Failed to duplicate job', insertError)
      return new Response(JSON.stringify({ error: 'Failed to create your copy.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Duplicate outputs
    const { data: outputs } = await serviceClient
      .from('job_outputs')
      .select('output_type, content, custom_prompt')
      .eq('job_id', share.job_id)

    if (outputs && outputs.length > 0) {
      await serviceClient.from('job_outputs').insert(
        outputs.map(o => ({
          job_id: newJob.id,
          output_type: o.output_type,
          content: o.content,
          custom_prompt: o.custom_prompt,
        }))
      )
    }

    // Mark share as claimed
    await serviceClient
      .from('transcript_shares')
      .update({
        claimed: true,
        claimed_at: new Date().toISOString(),
        claimed_by: user.id,
        claimed_job_id: newJob.id,
      })
      .eq('id', share.id)

    return new Response(JSON.stringify({ success: true, job_id: newJob.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('claim-transcript-share error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
