// Verifies a 6-digit OTP for a share token. On success returns a HMAC-signed
// view session token valid until the share expires.

import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { hashOtpCode, issueShareViewSession } from '../_shared/share-view-session.ts'

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    if (!token || token.length < 16) return jsonResponse({ error: 'invalid_token' }, 400)
    if (!/^\d{6}$/.test(code)) return jsonResponse({ error: 'invalid_code_format' }, 400)

    const svc = createServiceClient()

    const { data: share } = await svc
      .from('transcript_shares')
      .select('token, recipient_email, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle()

    if (!share) return jsonResponse({ error: 'not_found' }, 404)
    if (share.revoked_at) return jsonResponse({ error: 'revoked', revoked_at: share.revoked_at }, 410)
    const expiresAtMs = new Date(share.expires_at).getTime()
    if (expiresAtMs < Date.now()) return jsonResponse({ error: 'expired' }, 410)

    const { data: otp } = await svc
      .from('share_view_otps')
      .select('id, code_hash, attempts, expires_at, consumed_at')
      .eq('share_token', token)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otp) return jsonResponse({ error: 'no_active_code' }, 400)
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'code_expired' }, 400)
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await svc.from('share_view_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', otp.id)
      return jsonResponse({ error: 'too_many_attempts' }, 429)
    }

    const provided = await hashOtpCode(token, code)
    // Constant-time compare on equal-length hex strings
    let diff = 0
    if (provided.length !== otp.code_hash.length) diff = 1
    else {
      for (let i = 0; i < provided.length; i++) {
        diff |= provided.charCodeAt(i) ^ otp.code_hash.charCodeAt(i)
      }
    }

    if (diff !== 0) {
      await svc.from('share_view_otps')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id)
      return jsonResponse({
        error: 'invalid_code',
        attempts_remaining: Math.max(0, MAX_ATTEMPTS - (otp.attempts + 1)),
      }, 400)
    }

    // Consume the OTP
    await svc.from('share_view_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otp.id)

    // Issue session valid until share expiry (capped)
    const ttlSeconds = Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000))
    const recipientLower = share.recipient_email.toLowerCase().trim()
    const session = await issueShareViewSession(token, recipientLower, ttlSeconds)

    return jsonResponse({
      ok: true,
      session,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    })
  } catch (e) {
    console.error('[share-view-verify-otp] error', e)
    return jsonResponse({ error: 'internal' }, 500)
  }
})
