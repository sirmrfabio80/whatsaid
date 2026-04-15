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
      const token = req.headers.get('x-share-token') || ''
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: share } = await serviceClient
        .from('transcript_shares')
        .select('*')
        .eq('token', token)
        .maybeSingle()

      if (!share) {
        return new Response(JSON.stringify({ error: 'This link is not valid or has expired.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: job } = await serviceClient
        .from('jobs')
        .select('title, file_name')
        .eq('id', share.job_id)
        .maybeSingle()

      const { data: senderProfile } = await serviceClient
        .from('profiles')
        .select('email')
        .eq('user_id', share.shared_by)
        .maybeSingle()

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

    const userEmail = user.email?.toLowerCase().trim()
    const recipientEmail = share.recipient_email.toLowerCase().trim()

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle()
    const profileEmail = profile?.email?.toLowerCase().trim()

    const authMatch = userEmail === recipientEmail
    const profileMatch = !!profileEmail && profileEmail === recipientEmail

    if (!authMatch && !profileMatch) {
      console.log(`Email mismatch: auth=${userEmail}, profile=${profileEmail}, recipient=${recipientEmail}`)
      return new Response(JSON.stringify({
        error: `This transcript was shared with ${share.recipient_email}. Please sign in with that email address.`
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Access granted via ${authMatch ? 'auth' : 'profile'} email match`)

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

    // Duplicate job (including output_language)
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
        output_language: originalJob.output_language,
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

    // Duplicate outputs with positional ID mapping
    const { data: outputs } = await serviceClient
      .from('job_outputs')
      .select('id, output_type, content, custom_prompt')
      .eq('job_id', share.job_id)
      .order('created_at', { ascending: true })

    const idMap: Array<{ oldId: string; newId: string }> = []

    if (outputs && outputs.length > 0) {
      for (const o of outputs) {
        const { data: newOutput } = await serviceClient
          .from('job_outputs')
          .insert({
            job_id: newJob.id,
            output_type: o.output_type,
            content: o.content,
            custom_prompt: o.custom_prompt,
          })
          .select('id')
          .single()
        if (newOutput) {
          idMap.push({ oldId: o.id, newId: newOutput.id })
        }
      }
    }

    // Copy active-language variants if applicable
    const activeLang = originalJob.output_language
    if (activeLang && activeLang !== originalJob.language_detected && idMap.length > 0) {
      const oldOutputIds = idMap.map(m => m.oldId)
      const { data: variants } = await serviceClient
        .from('job_output_variants')
        .select('job_output_id, language, content, source_hash')
        .in('job_output_id', oldOutputIds)
        .eq('language', activeLang)

      if (variants && variants.length > 0) {
        const variantInserts = variants
          .map(v => {
            const mapped = idMap.find(m => m.oldId === v.job_output_id)
            if (!mapped) return null
            return {
              job_output_id: mapped.newId,
              language: v.language,
              content: v.content,
              source_hash: v.source_hash,
            }
          })
          .filter(Boolean)

        if (variantInserts.length > 0) {
          await serviceClient.from('job_output_variants').insert(variantInserts)
        }
      }
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
