// Public, token-based audit log endpoint for transcript shares.
//
// Returns audit metadata about a single share (created/expires/revoked/
// last-viewed timestamps, revoker identity, reason). The capability is the
// per-share revocation_token — same model as share-revoke. No JWT required.
//
// Formats supported server-side: `json` (default) and `txt`. PDF rendering
// is performed client-side from the JSON payload.

import { handleCorsPreflight, jsonResponse, corsHeaders } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { SITE_NAME, SITE_URL } from '../_shared/constants.ts'

type Format = 'json' | 'txt'

interface AuditPayload {
  site: { name: string; url: string }
  share: {
    id: string
    job_id: string
    job_title: string
    recipient_email: string
    created_at: string | null
    expires_at: string | null
    last_viewed_at: string | null
    email_in_body: boolean | null
  }
  revocation: {
    revoked_at: string | null
    revoke_reason: string | null
    revoked_by_label: string | null
  }
  generated_at: string
}

function buildText(p: AuditPayload): string {
  const fmt = (v: string | null) => (v ? new Date(v).toISOString() : '—')
  const lines = [
    `${p.site.name} — Share audit log`,
    p.site.url,
    '',
    `Generated:        ${p.generated_at}`,
    '',
    '— Share —',
    `Share ID:         ${p.share.id}`,
    `Job:              ${p.share.job_title} (${p.share.job_id})`,
    `Recipient:        ${p.share.recipient_email}`,
    `Created:          ${fmt(p.share.created_at)}`,
    `Expires:          ${fmt(p.share.expires_at)}`,
    `Last successful view: ${fmt(p.share.last_viewed_at)}`,
    `Email-in-body:    ${p.share.email_in_body ? 'yes' : 'no'}`,
    '',
    '— Revocation —',
    `Revoked at:       ${fmt(p.revocation.revoked_at)}`,
    `Revoked by:       ${p.revocation.revoked_by_label ?? '—'}`,
    `Reason:           ${p.revocation.revoke_reason ?? '—'}`,
    '',
  ]
  return lines.join('\n')
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    let token = ''
    let format: Format = 'json'

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      token = typeof body?.token === 'string' ? body.token.trim() : ''
      if (body?.format === 'txt' || body?.format === 'json') format = body.format
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      token = (url.searchParams.get('token') ?? '').trim()
      const fmt = url.searchParams.get('format')
      if (fmt === 'txt' || fmt === 'json') format = fmt
    } else {
      return jsonResponse({ error: 'method_not_allowed' }, 405)
    }

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return jsonResponse({ error: 'invalid_token' }, 400)
    }

    const svc = createServiceClient()
    const { data: share, error: selErr } = await svc
      .from('transcript_shares')
      .select(
        'id, job_id, recipient_email, created_at, expires_at, last_viewed_at, email_in_body, revoked_at, revoke_reason, revoked_by_label',
      )
      .eq('revocation_token', token)
      .maybeSingle()

    if (selErr) {
      console.error('[share-audit-log] select error', selErr)
      return jsonResponse({ error: 'server_error' }, 500)
    }
    if (!share) return jsonResponse({ error: 'not_found' }, 404)

    const { data: job } = await svc
      .from('jobs')
      .select('title, file_name')
      .eq('id', share.job_id)
      .maybeSingle()

    const jobTitle =
      job?.title || job?.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'

    const payload: AuditPayload = {
      site: { name: SITE_NAME, url: SITE_URL },
      share: {
        id: share.id,
        job_id: share.job_id,
        job_title: jobTitle,
        recipient_email: share.recipient_email,
        created_at: share.created_at,
        expires_at: share.expires_at,
        last_viewed_at: share.last_viewed_at,
        email_in_body: share.email_in_body,
      },
      revocation: {
        revoked_at: share.revoked_at,
        revoke_reason: share.revoke_reason,
        revoked_by_label: share.revoked_by_label,
      },
      generated_at: new Date().toISOString(),
    }

    if (format === 'txt') {
      return new Response(buildText(payload), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    return jsonResponse(payload)
  } catch (err) {
    console.error('[share-audit-log] unexpected', err)
    return jsonResponse({ error: 'server_error' }, 500)
  }
})
