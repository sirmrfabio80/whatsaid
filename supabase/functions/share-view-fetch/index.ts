// Returns transcript content for an anonymous viewer holding a valid share-view
// session token issued by share-view-verify-otp. Mirrors the rendering logic of
// share-transcript (speaker renames + translated variants) but never exposes raw
// audio or owner-only metadata.

import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { verifyShareViewSession } from '../_shared/share-view-session.ts'
import { resolveActiveNotice, recordRecipientNotification } from '../_shared/recipient-notice.ts'
import { buildRevokedPayload } from '../_shared/share-revoked-payload.ts'

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applySpeakerNames(text: string, names: Record<string, string> | null | undefined): string {
  if (!text || !names) return text
  let result = text
  for (const [original, renamed] of Object.entries(names)) {
    if (!original || !renamed) continue
    const lineStartRegex = new RegExp(`^${escapeRegex(original)}:`, 'gm')
    result = result.replace(lineStartRegex, `${renamed}:`)
    const inlineRegex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'g')
    result = result.replace(inlineRegex, renamed)
  }
  return result
}

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
      .select('id, token, job_id, expires_at, revoked_at, revoke_reason, revoked_by_label, shared_by, recipient_email, last_viewed_at')
      .eq('token', token)
      .maybeSingle()

    if (!share) return jsonResponse({ error: 'not_found' }, 404)
    if (share.revoked_at) return jsonResponse(await buildRevokedPayload(svc, share), 410)
    if (new Date(share.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 410)
    }

    const { data: job } = await svc
      .from('jobs')
      .select('id, title, file_name, speaker_names, output_language, language_detected, user_id')
      .eq('id', share.job_id)
      .maybeSingle()

    if (!job) return jsonResponse({ error: 'job_not_found' }, 404)

    const { data: senderProfile } = await svc
      .from('profiles')
      .select('display_name, email')
      .eq('user_id', share.shared_by)
      .maybeSingle()

    const senderEmail = senderProfile?.email || 'someone'
    const senderLabel = senderProfile?.display_name || senderEmail

    const { data: outputs } = await svc
      .from('job_outputs')
      .select('id, output_type, content, custom_prompt')
      .eq('job_id', share.job_id)
      .order('created_at', { ascending: true })

    const activeOutputLang = job.output_language || job.language_detected || 'en'
    const originalLang = job.language_detected || 'en'
    const useVariants = activeOutputLang !== originalLang

    const variantMap: Record<string, string> = {}
    if (useVariants && outputs && outputs.length > 0) {
      const { data: variantRows } = await svc
        .from('job_output_variants')
        .select('job_output_id, content')
        .in('job_output_id', outputs.map((o: { id: string }) => o.id))
        .eq('language', activeOutputLang)
      if (variantRows) {
        for (const v of variantRows) variantMap[v.job_output_id] = v.content
      }
    }

    const getContent = (output: { id: string; content: string }) =>
      useVariants && variantMap[output.id] ? variantMap[output.id] : output.content

    const transcriptOutput = outputs?.find((o: { output_type: string }) => o.output_type === 'transcript')
    const summaryOutput = outputs?.find((o: { output_type: string }) => o.output_type === 'summary')
    const questions = (outputs ?? [])
      .filter((o: { output_type: string }) => o.output_type === 'custom' || o.output_type === 'question')
      .map((o: { id: string; custom_prompt: string | null; content: string }) => ({
        prompt: o.custom_prompt,
        answer: applySpeakerNames(getContent(o), (job.speaker_names ?? {}) as Record<string, string>),
      }))

    if (!transcriptOutput) {
      return jsonResponse({ error: 'no_transcript' }, 404)
    }

    const speakerNames = (job.speaker_names ?? {}) as Record<string, string>
    const transcript = applySpeakerNames(getContent(transcriptOutput), speakerNames)
    const summary = summaryOutput ? applySpeakerNames(getContent(summaryOutput), speakerNames) : null

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Shared transcript'

    // Record a first-view notice (Art. 14 told-once via 'view' channel).
    // Soft-fail; the unique constraint dedupes repeat views.
    const notice = await resolveActiveNotice(svc)
    if (notice) {
      await recordRecipientNotification(svc, {
        jobId: share.job_id,
        sharedBy: share.shared_by,
        recipientEmail: share.recipient_email,
        channel: 'view',
        notice,
      })
    }

    // Snapshot the prior view time before bumping it, so the audit panel can
    // show "last viewed before this session" rather than "now".
    const previousLastViewedAt = share.last_viewed_at ?? null
    // Best-effort update; failure here must not block returning the content.
    svc.from('transcript_shares')
      .update({ last_viewed_at: new Date().toISOString() })
      .eq('id', share.id)
      .then(({ error }) => { if (error) console.warn('[share-view-fetch] last_viewed_at update failed', error) })

    return jsonResponse({
      ok: true,
      title,
      sender_label: senderLabel,
      sender_email: senderProfile?.email ?? null,
      transcript,
      summary,
      questions,
      language: activeOutputLang,
      expires_at: share.expires_at,
      last_viewed_at: previousLastViewedAt,
      notice: notice
        ? { version: notice.version, text_en: notice.text_en }
        : null,

    })
  } catch (e) {
    console.error('[share-view-fetch] error', e)
    return jsonResponse({ error: 'internal' }, 500)
  }
})
