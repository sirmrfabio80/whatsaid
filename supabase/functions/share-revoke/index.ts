// Public, token-based revocation endpoint for transcript shares.
//
// Either the recipient (from the email footer link) or the sender can hit
// this endpoint with the per-share revocation_token. We mark the share as
// revoked (revoked_at = now, expires_at = now) so subsequent view-fetch /
// OTP attempts fail with 410. We also blank out attestation_consent_event_id
// is intentionally preserved for audit — only access is cut off.
//
// No auth header required: knowledge of the random 64-char hex token is
// the capability. Idempotent: re-revoking an already-revoked share is a
// no-op success.

import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    let token = ''
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      token = typeof body?.token === 'string' ? body.token.trim() : ''
    } else {
      const url = new URL(req.url)
      token = (url.searchParams.get('token') ?? '').trim()
    }

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return jsonResponse({ error: 'invalid_token' }, 400)
    }

    const svc = createServiceClient()
    const { data: share, error: selErr } = await svc
      .from('transcript_shares')
      .select('id, revoked_at, recipient_email')
      .eq('revocation_token', token)
      .maybeSingle()

    if (selErr) {
      console.error('[share-revoke] select error', selErr)
      return jsonResponse({ error: 'server_error' }, 500)
    }
    if (!share) return jsonResponse({ error: 'not_found' }, 404)

    if (share.revoked_at) {
      return jsonResponse({ ok: true, alreadyRevoked: true })
    }

    const nowIso = new Date().toISOString()
    const { error: updErr } = await svc
      .from('transcript_shares')
      .update({ revoked_at: nowIso, expires_at: nowIso })
      .eq('id', share.id)

    if (updErr) {
      console.error('[share-revoke] update error', updErr)
      return jsonResponse({ error: 'server_error' }, 500)
    }

    console.log('[share-revoke] revoked', { shareId: share.id })
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[share-revoke] unexpected', err)
    return jsonResponse({ error: 'server_error' }, 500)
  }
})
