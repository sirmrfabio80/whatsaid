import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SITE_NAME = 'WhatSaid'
const SITE_URL = 'https://whatsaid.app'
const SENDER_DOMAIN = 'notify.whatsaid.app'
const FROM_DOMAIN = 'whatsaid.app'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildShareEmail(opts: {
  title: string
  senderName: string
  senderEmail: string
  claimUrl: string
}): { html: string; text: string } {
  const { title, senderName, senderEmail, claimUrl } = opts

  const displaySender = senderName || senderEmail

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:32px 28px 24px;">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 16px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 16px;line-height:1.3;">A transcript has been shared with you</h1>
        <p style="font-size:15px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 8px;">
          <strong>${escapeHtml(displaySender)}</strong> shared a transcript record with you:
        </p>
        <div style="margin:16px 0 24px;padding:14px 18px;background:hsl(220,20%,97%);border-radius:10px;border-left:3px solid hsl(245,50%,48%);">
          <p style="font-size:16px;font-weight:600;color:hsl(220,25%,10%);margin:0;">${escapeHtml(title)}</p>
        </div>
        <p style="font-size:14px;color:hsl(220,10%,40%);line-height:1.6;margin:0 0 24px;">
          Click below to open your own copy. You'll be able to view the full transcript, summary, and AI-generated outputs — and they'll be saved in your account.
        </p>
        <div style="text-align:center;margin:0 0 24px;">
          <a href="${claimUrl}" style="display:inline-block;background:hsl(245,50%,48%);color:#ffffff;font-size:15px;font-weight:600;border-radius:12px;padding:14px 32px;text-decoration:none;">
            Open transcript
          </a>
        </div>
        <p style="font-size:13px;color:hsl(220,10%,55%);line-height:1.5;margin:0;">
          If you don't have a ${SITE_NAME} account yet, you'll be asked to create one first — it only takes a moment.
        </p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">
          Shared via <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a> · This link expires in 30 days
        </p>
      </div>
    </div>
  </div>
</body>
</html>`

  const text = `${displaySender} shared a transcript record with you on ${SITE_NAME}.

"${title}"

Open your copy: ${claimUrl}

You'll get your own copy of the full transcript, summary, and AI outputs saved in your account.

If you don't have a ${SITE_NAME} account, you'll be asked to create one first.

This link expires in 30 days.`

  return { html, text }
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

    // Authenticate user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { job_id, recipient_email } = await req.json()
    if (!job_id || !recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Verify job belongs to user
    const { data: job, error: jobError } = await serviceClient
      .from('jobs')
      .select('id, title, file_name, user_id')
      .eq('id', job_id)
      .maybeSingle()

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if there's already an active unclaimed share for this job+recipient
    const { data: existing } = await serviceClient
      .from('transcript_shares')
      .select('id, token')
      .eq('job_id', job_id)
      .eq('recipient_email', recipient_email.toLowerCase())
      .eq('claimed', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    let shareToken: string

    if (existing) {
      // Reuse existing share
      shareToken = existing.token
    } else {
      // Create share record
      const { data: share, error: shareError } = await serviceClient
        .from('transcript_shares')
        .insert({
          job_id,
          shared_by: user.id,
          recipient_email: recipient_email.toLowerCase(),
        })
        .select('token')
        .single()

      if (shareError || !share) {
        console.error('Failed to create share record', shareError)
        return new Response(JSON.stringify({ error: 'Failed to create share' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      shareToken = share.token
    }

    // Get sender profile
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'
    const claimUrl = `${SITE_URL}/claim/${shareToken}`

    const { html, text } = buildShareEmail({
      title,
      senderName: profile?.display_name || '',
      senderEmail: user.email || '',
      claimUrl,
    })

    // Enqueue email
    const messageId = crypto.randomUUID()
    await serviceClient.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'share-transcript-record',
      recipient_email: recipient_email.toLowerCase(),
      status: 'pending',
    })

    const { error: enqueueError } = await serviceClient.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: recipient_email.toLowerCase(),
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `${profile?.display_name || user.email} shared a transcript with you: ${title}`,
        html,
        text,
        purpose: 'transactional',
        label: 'share-transcript-record',
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.error('Failed to enqueue email', enqueueError)
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('share-transcript-record error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
