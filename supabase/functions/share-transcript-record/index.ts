import { SITE_NAME, SITE_URL, SENDER_DOMAIN, FROM_DOMAIN } from '../_shared/constants.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { enforceQuota } from '../_shared/quota.ts'
import { createServiceClient, requireAuth } from '../_shared/supabase.ts'
import {
  buildNoticeHtml,
  buildNoticeText,
  recordRecipientNotification,
  resolveActiveNotice,
} from '../_shared/recipient-notice.ts'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildShareRecordEmail(opts: {
  title: string
  senderLabel: string
  claimUrl: string
  noticeHtml: string
}): string {
  const { title, senderLabel, claimUrl, noticeHtml } = opts

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
      <div style="padding:0 28px 24px;text-align:center;">
        <a href="${claimUrl}" style="display:inline-block;padding:14px 40px;background:hsl(245,50%,48%);color:#fff;font-size:15px;font-weight:600;border-radius:12px;text-decoration:none;letter-spacing:0.01em;margin:0 8px 12px;">Open your copy</a>
        <p style="font-size:13px;color:hsl(220,10%,55%);margin:20px 0 0;line-height:1.5;">
          Sign in or create a free WhatSaid account first to access this share. This link expires in 2 days.
        </p>
      </div>
      <div style="padding:0 28px 28px;text-align:left;">${noticeHtml}</div>
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
    const auth = await requireAuth(req.headers.get('Authorization'))
    if (!auth.ok) return auth.response
    const { userId, email } = auth
    const user = { id: userId, email }

    const body = await req.json()
    const job_id = typeof body?.job_id === 'string' ? body.job_id : ''
    const recipient_email = typeof body?.recipient_email === 'string' ? body.recipient_email : ''
    if (!job_id || !recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createServiceClient()

    // Same quotas as share-transcript: per-recipient-per-job-per-day = 3,
    // per-user-per-day = 30. share_transcript_email is the shared bucket so
    // a user can't dodge the cap by alternating between the two endpoints.
    const recipientBlocked = await enforceQuota(serviceClient, {
      userId: user.id,
      action: 'share_transcript_email',
      scope: 'recipient_job_day',
      window: '1 day',
      limit: 3,
      jobId: job_id,
      scopeKey: recipient_email.toLowerCase().trim(),
    })
    if (recipientBlocked) return recipientBlocked
    const userBlocked = await enforceQuota(serviceClient, {
      userId: user.id,
      action: 'share_transcript_email',
      scope: 'user_day',
      window: '1 day',
      limit: 30,
    })
    if (userBlocked) return userBlocked


    const { data: senderProfile } = await serviceClient
      .from('profiles')
      .select('display_name, email')
      .eq('user_id', user.id)
      .maybeSingle()

    const senderDisplayName = senderProfile?.display_name || null
    const senderEmail = senderProfile?.email || user.email || 'someone'
    const senderLabel = senderDisplayName || senderEmail

    const { data: job } = await serviceClient
      .from('jobs')
      .select('title, file_name, user_id')
      .eq('id', job_id)
      .maybeSingle()

    if (!job || job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipientLower = recipient_email.toLowerCase().trim()

    const { data: share, error: shareError } = await serviceClient
      .from('transcript_shares')
      .insert({
        job_id,
        recipient_email: recipientLower,
        shared_by: user.id,
      })
      .select('token')
      .single()

    if (shareError || !share) {
      console.error('Failed to create share record', shareError)
      return new Response(JSON.stringify({ error: 'Failed to create share' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'
    const claimUrl = `${SITE_URL}/claim/${share.token}`

    const messageId = crypto.randomUUID()
    const shortId = messageId.slice(0, 6)

    const notice = await resolveActiveNotice(serviceClient)
    const noticeCtx = { senderLabel, senderEmail, jobShortId: shortId }
    const noticeHtml = notice ? buildNoticeHtml(notice, noticeCtx) : ''
    const noticeText = notice ? buildNoticeText(notice, noticeCtx) : ''
    if (!notice) {
      console.warn('[share-transcript-record] no active share_recipient_notice version found')
    }

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

    const subjectLine = `Transcript shared with you: ${title} [${shortId}]`
    const textParts = [
      `${senderLabel} shared a transcript with you on ${SITE_NAME}.`,
      '',
      `"${title}"`,
      '',
      `Open your copy: ${claimUrl}`,
      '',
      'Sign in or create a free WhatSaid account first to access this share.',
      'This link expires in 2 days.',
      noticeText,
    ]

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
        html: buildShareRecordEmail({ title, senderLabel, claimUrl, noticeHtml }),
        text: textParts.join('\n'),
        purpose: 'transactional',
        label: 'share-transcript-record',
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    let noticeLogged = false
    if (notice) {
      noticeLogged = await recordRecipientNotification(serviceClient, {
        jobId: job_id,
        sharedBy: user.id,
        recipientEmail: recipient_email,
        channel: 'share_transcript_record',
        notice,
        messageId,
      })
      if (!noticeLogged) {
        console.log('[share-transcript-record] already_notified', { job_id, version: notice.version })
      }
    }

    return new Response(JSON.stringify({ success: true, notice_logged: noticeLogged }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('share-transcript-record error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})