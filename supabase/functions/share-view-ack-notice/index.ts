// Records the recipient's acknowledgment of the in-app UK GDPR Art. 14 notice
// shown the first time they open a shared transcript. Channel = 'in_app_modal'.
// Server-side dedup is enforced by the partial unique index on
// (job_id, recipient_email_hash, channel, notice_version).

import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { verifyShareViewSession } from '../_shared/share-view-session.ts'
import { resolveActiveNotice, recordRecipientNotification } from '../_shared/recipient-notice.ts'

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const session = typeof body?.session === 'string' ? body.session.trim() : ''
    if (!token || !session) return jsonResponse({ error: 'invalid_input' }, 400)

    const payload = await verifyShareViewSession(session)
    if (!payload || payload.shareToken !== token) {
      return jsonResponse({ error: 'invalid_session' }, 401)
    }

    const svc = createServiceClient()
    const { data: share } = await svc
      .from('transcript_shares')
      .select('job_id, shared_by, recipient_email, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (!share) return jsonResponse({ error: 'not_found' }, 404)
    if (share.revoked_at) return jsonResponse({ error: 'revoked', revoked_at: share.revoked_at }, 410)
    if (new Date(share.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 410)
    }

    const notice = await resolveActiveNotice(svc)
    if (!notice) return jsonResponse({ ok: true, recorded: false, reason: 'no_active_notice' })

    const recorded = await recordRecipientNotification(svc, {
      jobId: share.job_id,
      sharedBy: share.shared_by,
      recipientEmail: share.recipient_email,
      channel: 'in_app_modal',
      notice,
    })

    return jsonResponse({ ok: true, recorded, version: notice.version })
  } catch (e) {
    console.error('[share-view-ack-notice] error', e)
    return jsonResponse({ error: 'internal' }, 500)
  }
})
