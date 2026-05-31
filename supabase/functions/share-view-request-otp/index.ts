// Sends a 6-digit OTP code to the recipient email associated with a share token.
// Anonymous endpoint (no JWT). Rate-limited per share via transcript_shares.last_view_otp_sent_at.

import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { SITE_NAME, SITE_URL, SENDER_DOMAIN, FROM_DOMAIN } from '../_shared/constants.ts'
import { hashOtpCode } from '../_shared/share-view-session.ts'

const OTP_TTL_SECONDS = 10 * 60 // 10 min
const RESEND_COOLDOWN_SECONDS = 30

function generateCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % 1_000_000).toString().padStart(6, '0')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token || token.length < 16) {
      return jsonResponse({ error: 'invalid_token' }, 400)
    }

    const svc = createServiceClient()
    const { data: share } = await svc
      .from('transcript_shares')
      .select('token, recipient_email, expires_at, claimed, last_view_otp_sent_at, job_id')
      .eq('token', token)
      .maybeSingle()

    if (!share) return jsonResponse({ error: 'not_found' }, 404)
    if (new Date(share.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 410)
    }

    // Resend cooldown
    if (share.last_view_otp_sent_at) {
      const elapsedMs = Date.now() - new Date(share.last_view_otp_sent_at).getTime()
      if (elapsedMs < RESEND_COOLDOWN_SECONDS * 1000) {
        return jsonResponse({
          error: 'cooldown',
          retry_after_seconds: Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000),
        }, 429)
      }
    }

    const recipientLower = share.recipient_email.toLowerCase().trim()
    const code = generateCode()
    const codeHash = await hashOtpCode(token, code)
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString()

    // Invalidate any prior unconsumed OTPs for this token
    await svc.from('share_view_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('share_token', token)
      .is('consumed_at', null)

    const { error: insErr } = await svc.from('share_view_otps').insert({
      share_token: token,
      recipient_email_lower: recipientLower,
      code_hash: codeHash,
      expires_at: expiresAt,
    })
    if (insErr) {
      console.error('[share-view-request-otp] insert failed', insErr)
      return jsonResponse({ error: 'internal' }, 500)
    }

    await svc.from('transcript_shares')
      .update({ last_view_otp_sent_at: new Date().toISOString() })
      .eq('token', token)

    // Send the OTP email via the existing transactional queue
    const messageId = crypto.randomUUID()
    const subject = `Your ${SITE_NAME} access code: ${code}`
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 12px;">${escapeHtml(SITE_NAME)}</p>
      <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;color:hsl(220,25%,10%);margin:0 0 16px;">Verify it's you</h1>
      <p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 16px;">Enter this code on the ${escapeHtml(SITE_NAME)} share page to view the transcript that was shared with you:</p>
      <div style="font-family:'JetBrains Mono',monospace;font-size:32px;letter-spacing:0.4em;font-weight:700;color:hsl(220,25%,10%);background:hsl(220,20%,97%);border-radius:10px;padding:16px;text-align:center;margin:0 0 16px;">${escapeHtml(code)}</div>
      <p style="font-size:13px;color:hsl(220,10%,55%);margin:0;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
    <p style="font-size:12px;color:hsl(220,10%,55%);text-align:center;margin:16px 0 0;">${escapeHtml(SITE_NAME)} · <a href="${SITE_URL}" style="color:hsl(245,50%,48%);">${escapeHtml(SITE_URL.replace('https://', ''))}</a></p>
  </div>
</body></html>`
    const text = `${SITE_NAME} access code: ${code}\n\nEnter this code on the ${SITE_NAME} share page. It expires in 10 minutes.\n\nIf you didn't request it, ignore this email.`

    await svc.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'share-view-otp',
      recipient_email: share.recipient_email,
      status: 'pending',
    })

    const { error: enqErr } = await svc.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        idempotency_key: `share-view-otp-${messageId}`,
        to: share.recipient_email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'share-view-otp',
        queued_at: new Date().toISOString(),
      },
    })

    if (enqErr) {
      console.error('[share-view-request-otp] enqueue failed', enqErr)
      return jsonResponse({ error: 'email_failed' }, 500)
    }

    return jsonResponse({
      ok: true,
      recipient_hint: recipientLower.replace(/(.).+(@.+)/, '$1***$2'),
      expires_in: OTP_TTL_SECONDS,
    })
  } catch (e) {
    console.error('[share-view-request-otp] error', e)
    return jsonResponse({ error: 'internal' }, 500)
  }
})
