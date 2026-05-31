// Public, token-based revocation endpoint for transcript shares.
//
// Either the recipient (from the email footer link) or the sender can hit
// this endpoint with the per-share revocation_token. We mark the share as
// revoked (revoked_at = now, expires_at = now) so subsequent view-fetch /
// OTP attempts fail with 410.
//
// No auth header is required to revoke: knowledge of the random 64-char hex
// token is the capability. However, if a valid user JWT is present we
// capture revoked_by + revoked_by_label so the recipient page can show who
// withdrew access. An optional `reason` (≤500 chars) can also be supplied.
//
// Idempotent: re-revoking an already-revoked share is a no-op success.
// After a fresh revocation we enqueue a transactional email to the recipient
// so they know access was withdrawn and why.

import { FROM_DOMAIN, SENDER_DOMAIN, SITE_NAME } from '../_shared/constants.ts'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'
import { renderRevocationEmail } from '../_shared/share-revoke-email.ts'

const MAX_REASON_LENGTH = 500


Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    let token = ''
    let reason: string | null = null
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      token = typeof body?.token === 'string' ? body.token.trim() : ''
      if (typeof body?.reason === 'string') {
        const trimmed = body.reason.trim()
        if (trimmed) reason = trimmed.slice(0, MAX_REASON_LENGTH)
      }
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
      .select('id, revoked_at, recipient_email, shared_by, job_id')
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

    // Best-effort identity capture. Failing to resolve a user is fine —
    // revocation must still succeed (capability is the token itself).
    let revokedBy: string | null = null
    let revokedByLabel: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const userClient = createUserClient(authHeader)
        const { data: { user } } = await userClient.auth.getUser()
        if (user?.id) {
          revokedBy = user.id
          const { data: profile } = await svc
            .from('profiles')
            .select('display_name, email')
            .eq('user_id', user.id)
            .maybeSingle()
          revokedByLabel = profile?.display_name || profile?.email || user.email || null
        }
      } catch (e) {
        console.warn('[share-revoke] identity capture failed', e)
      }
    }

    const nowIso = new Date().toISOString()
    const { error: updErr } = await svc
      .from('transcript_shares')
      .update({
        revoked_at: nowIso,
        expires_at: nowIso,
        revoke_reason: reason,
        revoked_by: revokedBy,
        revoked_by_label: revokedByLabel,
      })
      .eq('id', share.id)

    if (updErr) {
      console.error('[share-revoke] update error', updErr)
      return jsonResponse({ error: 'server_error' }, 500)
    }

    // ── Send revocation notification email ────────────────────────────────
    try {
      const { data: job } = await svc
        .from('jobs')
        .select('title, file_name')
        .eq('id', share.job_id)
        .maybeSingle()

      const title = job?.title || job?.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'

      const { data: existingToken } = await svc
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', share.recipient_email.toLowerCase())
        .maybeSingle()

      let unsubscribeToken = existingToken?.token
      if (!unsubscribeToken) {
        unsubscribeToken = crypto.randomUUID()
        await svc.from('email_unsubscribe_tokens').insert({
          email: share.recipient_email.toLowerCase(),
          token: unsubscribeToken,
        })
      }

      const messageId = crypto.randomUUID()
      const { subject, html, text } = renderRevocationEmail({
        title,
        reason,
        revokerLabel: revokedByLabel,
      })

      const payload: Record<string, unknown> = {
        message_id: messageId,
        idempotency_key: `share-revoke-${share.id}-${messageId}`,
        to: share.recipient_email,
        from: `"${SITE_NAME}" <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'share-revoke',
        unsubscribe_token: unsubscribeToken,
        queued_at: nowIso,
      }


      const { error: enqueueErr } = await svc.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload,
      })

      if (enqueueErr) {
        console.error('[share-revoke] enqueue_email error', enqueueErr)
        // Non-fatal: revocation succeeded; email failure is best-effort.
      } else {
        console.log('[share-revoke] notification enqueued', { shareId: share.id, messageId })
      }
    } catch (emailErr) {
      console.error('[share-revoke] notification send error', emailErr)
      // Non-fatal: revocation succeeded; email failure is best-effort.
    }

    console.log('[share-revoke] revoked', { shareId: share.id, hasReason: !!reason, hasIdentity: !!revokedBy })
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[share-revoke] unexpected', err)
    return jsonResponse({ error: 'server_error' }, 500)
  }
})

