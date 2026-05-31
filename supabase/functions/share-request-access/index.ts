// Public, token-based endpoint for a recipient on a revoked /share page to
// ask the sender to re-grant access. The recipient already proved knowledge
// of the share token by reading the (now revoked) link, so no auth is
// required. We enqueue a transactional email to the sender containing the
// recipient's reason. The endpoint is intentionally tolerant:
//   - works for revoked shares (the primary use case)
//   - also works for expired/not_found by returning 404 so the UI can be honest
// Per-share rate limiting prevents abuse: at most 1 request per share per
// 10 minutes (tracked via a soft updated_at on transcript_shares via a
// dedicated column we already have for revoke_reason — we use a separate
// `last_access_request_at` timestamp on the share row).
//
// Body: { token: string, reason: string, requester_email?: string }
// Response: { ok: true } | { error: string }

import { FROM_DOMAIN, SENDER_DOMAIN, SITE_NAME, SITE_URL } from '../_shared/constants.ts'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const MAX_REASON_LENGTH = 1000
const MIN_REASON_LENGTH = 5
const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 minutes per share

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254
}

function buildHtml(opts: {
  title: string
  reason: string
  recipientEmail: string
  requesterEmail: string | null
  senderLabel: string | null
}): string {
  const { title, reason, recipientEmail, requesterEmail, senderLabel } = opts
  const greeting = senderLabel ? `Hi ${escapeHtml(senderLabel)},` : 'Hello,'
  const replyTo = requesterEmail || recipientEmail
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:28px 28px 20px;">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 8px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;line-height:1.3;">Someone is requesting access</h1>
        <p style="font-size:15px;color:hsl(220,10%,30%);line-height:1.55;margin:0 0 16px;">${greeting}</p>
        <p style="font-size:15px;color:hsl(220,10%,30%);line-height:1.55;margin:0 0 16px;"><strong>${escapeHtml(recipientEmail)}</strong> is asking for access to the transcript you previously shared with them: <strong>${escapeHtml(title)}</strong>.</p>
        <div style="background:hsl(220,20%,97%);border:1px solid hsl(220,15%,92%);border-radius:10px;padding:14px 16px;margin:0 0 16px;">
          <p style="font-size:12px;font-weight:600;color:hsl(220,10%,45%);text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;">Their message</p>
          <p style="font-size:14px;color:hsl(220,15%,20%);line-height:1.55;margin:0;white-space:pre-wrap;">${escapeHtml(reason)}</p>
        </div>
        <p style="font-size:13px;color:hsl(220,10%,45%);line-height:1.5;margin:0 0 8px;">Reply directly to this email to respond to <strong>${escapeHtml(replyTo)}</strong>, or open ${SITE_NAME} to re-share the transcript.</p>
        <p style="margin:20px 0 0;"><a href="${SITE_URL}/dashboard" style="display:inline-block;background:hsl(245,50%,48%);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">Open ${SITE_NAME}</a></p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">You're receiving this because you previously shared a transcript with ${escapeHtml(recipientEmail)} via ${SITE_NAME}.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function buildText(opts: {
  title: string
  reason: string
  recipientEmail: string
  requesterEmail: string | null
}): string {
  const replyTo = opts.requesterEmail || opts.recipientEmail
  return [
    `Access request · ${SITE_NAME}`,
    '',
    `${opts.recipientEmail} is requesting access to the transcript you previously shared: "${opts.title}".`,
    '',
    'Their message:',
    opts.reason,
    '',
    `Reply directly to this email to respond to ${replyTo}, or open ${SITE_NAME} to re-share:`,
    `${SITE_URL}/dashboard`,
  ].join('\n')
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const reasonRaw = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const requesterEmailRaw = typeof body?.requester_email === 'string' ? body.requester_email.trim().toLowerCase() : ''

    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
      return jsonResponse({ error: 'invalid_token' }, 400)
    }
    if (reasonRaw.length < MIN_REASON_LENGTH) {
      return jsonResponse({ error: 'reason_too_short' }, 400)
    }
    const reason = reasonRaw.slice(0, MAX_REASON_LENGTH)
    const requesterEmail = requesterEmailRaw && isEmail(requesterEmailRaw) ? requesterEmailRaw : null

    const svc = createServiceClient()
    const { data: share, error: selErr } = await svc
      .from('transcript_shares')
      .select('id, job_id, shared_by, recipient_email, last_access_request_at')
      .eq('token', token)
      .maybeSingle()

    if (selErr) {
      console.error('[share-request-access] select error', selErr)
      return jsonResponse({ error: 'server_error' }, 500)
    }
    if (!share) return jsonResponse({ error: 'not_found' }, 404)

    // Rate limit
    if (share.last_access_request_at) {
      const ageMs = Date.now() - new Date(share.last_access_request_at).getTime()
      if (ageMs < RATE_LIMIT_MS) {
        return jsonResponse({ error: 'rate_limited', retry_after_seconds: Math.ceil((RATE_LIMIT_MS - ageMs) / 1000) }, 429)
      }
    }

    // Resolve sender email + label
    const { data: ownerProfile } = await svc
      .from('profiles')
      .select('email, display_name')
      .eq('user_id', share.shared_by)
      .maybeSingle()

    const senderEmail = ownerProfile?.email
    if (!senderEmail) {
      console.error('[share-request-access] missing owner email', { shareId: share.id })
      return jsonResponse({ error: 'sender_unavailable' }, 500)
    }

    // Resolve job title
    const { data: job } = await svc
      .from('jobs')
      .select('title, file_name')
      .eq('id', share.job_id)
      .maybeSingle()
    const title = job?.title || job?.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'

    // Unsubscribe token for sender
    const { data: existingToken } = await svc
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', senderEmail.toLowerCase())
      .maybeSingle()

    let unsubscribeToken = existingToken?.token
    if (!unsubscribeToken) {
      unsubscribeToken = crypto.randomUUID()
      await svc.from('email_unsubscribe_tokens').insert({
        email: senderEmail.toLowerCase(),
        token: unsubscribeToken,
      })
    }

    const replyTo = requesterEmail || share.recipient_email
    const messageId = crypto.randomUUID()
    const nowIso = new Date().toISOString()

    const html = buildHtml({
      title,
      reason,
      recipientEmail: share.recipient_email,
      requesterEmail,
      senderLabel: ownerProfile?.display_name ?? null,
    })
    const text = buildText({
      title,
      reason,
      recipientEmail: share.recipient_email,
      requesterEmail,
    })

    const payload: Record<string, unknown> = {
      message_id: messageId,
      idempotency_key: `share-access-req-${share.id}-${messageId}`,
      to: senderEmail,
      from: `"${SITE_NAME}" <noreply@${FROM_DOMAIN}>`,
      reply_to: replyTo,
      sender_domain: SENDER_DOMAIN,
      subject: `Access request: ${title}`,
      html,
      text,
      purpose: 'transactional',
      label: 'share-request-access',
      unsubscribe_token: unsubscribeToken,
      queued_at: nowIso,
    }

    const { error: enqueueErr } = await svc.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload,
    })

    if (enqueueErr) {
      console.error('[share-request-access] enqueue_email error', enqueueErr)
      return jsonResponse({ error: 'email_enqueue_failed' }, 500)
    }

    const { error: updErr } = await svc
      .from('transcript_shares')
      .update({ last_access_request_at: nowIso })
      .eq('id', share.id)
    if (updErr) {
      console.warn('[share-request-access] rate-limit timestamp update failed', updErr)
    }

    console.log('[share-request-access] sent', { shareId: share.id, messageId, hasRequesterEmail: !!requesterEmail })
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[share-request-access] unexpected', err)
    return jsonResponse({ error: 'server_error' }, 500)
  }
})
