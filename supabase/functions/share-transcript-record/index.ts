import { createClient } from 'npm:@supabase/supabase-js@2'
import { SITE_NAME, SITE_URL, SENDER_DOMAIN, FROM_DOMAIN } from '../_shared/constants.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildShareRecordEmail(opts: { title: string; senderLabel: string; claimUrl: string; pdfUrl: string | null }): string {
  const { title, senderLabel, claimUrl, pdfUrl } = opts

  const pdfSection = pdfUrl
    ? `<div style="margin:24px 0 0;text-align:center;">
        <a href="${pdfUrl}" style="display:inline-block;padding:12px 32px;background:hsl(220,20%,97%);color:hsl(245,50%,48%);font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;border:1px solid hsl(220,15%,88%);">📄 Download PDF</a>
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:10px 0 0;">This link expires in 7 days</p>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:32px 28px 24px;text-align:center;">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 16px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;line-height:1.3;">A transcript has been shared with you</h1>
        <p style="font-size:15px;color:hsl(220,10%,40%);margin:0 0 8px;line-height:1.5;"><strong>${escapeHtml(senderLabel)}</strong> shared a transcript with you:</p>
        <p style="font-size:16px;font-weight:600;color:hsl(220,25%,15%);margin:16px 0 24px;padding:12px 20px;background:hsl(220,20%,97%);border-radius:10px;display:inline-block;">${escapeHtml(title)}</p>
      </div>
      <div style="padding:0 28px 32px;text-align:center;">
        <a href="${claimUrl}" style="display:inline-block;padding:14px 40px;background:hsl(245,50%,48%);color:#fff;font-size:15px;font-weight:600;border-radius:12px;text-decoration:none;letter-spacing:0.01em;">Open your copy</a>
        <p style="font-size:13px;color:hsl(220,10%,55%);margin:20px 0 0;line-height:1.5;">
          Click the button to sign in (or create a free account) and get your own copy of this transcript in ${SITE_NAME}.
        </p>
        ${pdfSection}
      </div>
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;text-align:center;">
          <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a> — AI audio transcription
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { job_id, recipient_email, pdf_storage_path } = await req.json()
    if (!job_id || !recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch sender profile for display name / email
    const { data: senderProfile } = await serviceClient
      .from('profiles')
      .select('display_name, email')
      .eq('user_id', user.id)
      .maybeSingle()

    const senderDisplayName = senderProfile?.display_name || null
    const senderEmail = senderProfile?.email || user.email || 'someone'
    const senderLabel = senderDisplayName || senderEmail

    // Verify job ownership
    const { data: job } = await serviceClient
      .from('jobs')
      .select('title, file_name, user_id')
      .eq('id', job_id)
      .maybeSingle()

    if (!job || job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate signed URL for PDF if path was provided
    let pdfUrl: string | null = null
    if (pdf_storage_path && typeof pdf_storage_path === 'string') {
      const { data: signedUrlData, error: signedUrlError } = await serviceClient
        .storage
        .from('shared-pdfs')
        .createSignedUrl(pdf_storage_path, 7 * 24 * 60 * 60) // 7 days

      if (!signedUrlError && signedUrlData?.signedUrl) {
        pdfUrl = signedUrlData.signedUrl
      } else {
        console.error('Failed to create signed URL for PDF:', signedUrlError)
      }
    }

    // Create share record
    const { data: share, error: shareError } = await serviceClient
      .from('transcript_shares')
      .insert({
        job_id,
        recipient_email: recipient_email.toLowerCase().trim(),
        shared_by: user.id,
      })
      .select('token')
      .single()

    if (shareError || !share) {
      console.error('Failed to create share record', shareError)
      return new Response(JSON.stringify({ error: 'Failed to create share' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'
    const claimUrl = `${SITE_URL}/claim/${share.token}`

    // Send email
    const messageId = crypto.randomUUID()

    // Get or create unsubscribe token for recipient
    const recipientLower = recipient_email.toLowerCase().trim()
    const { data: existingToken } = await serviceClient
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', recipientLower)
      .maybeSingle()

    let unsubscribeToken = existingToken?.token
    if (!unsubscribeToken) {
      unsubscribeToken = crypto.randomUUID()
      await serviceClient.from('email_unsubscribe_tokens').insert({
        email: recipientLower,
        token: unsubscribeToken,
      })
    }

    await serviceClient.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'share-transcript-record',
      recipient_email,
      status: 'pending',
    })

    const subjectLine = `Transcript shared with you: ${title}`

    const pdfNote = pdfUrl ? `\n\nDownload PDF: ${pdfUrl}\n(This link expires in 7 days)` : ''

    await serviceClient.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        idempotency_key: `share-record-${messageId}`,
        to: recipient_email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        reply_to: senderEmail,
        sender_domain: SENDER_DOMAIN,
        subject: subjectLine,
        html: buildShareRecordEmail({ title, senderLabel, claimUrl, pdfUrl }),
        text: `${senderLabel} shared a transcript with you on ${SITE_NAME}.\n\n"${title}"\n\nOpen your copy: ${claimUrl}\n\nSign in or create a free account to get your own copy.${pdfNote}`,
        purpose: 'transactional',
        label: 'share-transcript-record',
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

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
