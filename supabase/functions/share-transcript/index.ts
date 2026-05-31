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

function markdownSectionsToHtml(content: string): string {
  const lines = content.split('\n')
  const html: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('## ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h3 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:16px;font-weight:700;color:hsl(220,25%,10%);margin:28px 0 8px;">${escapeHtml(trimmed.slice(3))}</h3>`)
    } else if (trimmed.startsWith('### ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h4 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:14px;font-weight:600;color:hsl(220,25%,10%);margin:20px 0 6px;">${escapeHtml(trimmed.slice(4))}</h4>`)
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (!inList) { html.push('<ul style="margin:0 0 12px;padding-left:20px;">'); inList = true }
      const bullet = trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      html.push(`<li style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin-bottom:4px;">${bullet}</li>`)
    } else if (trimmed === '') {
      if (inList) { html.push('</ul>'); inList = false }
    } else {
      if (inList) { html.push('</ul>'); inList = false }
      const text = escapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      html.push(`<p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 8px;">${text}</p>`)
    }
  }
  if (inList) html.push('</ul>')
  return html.join('\n')
}

function formatTranscript(content: string): string {
  const lines = content.split('\n')
  const html: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { html.push('<br/>'); continue }
    const match = trimmed.match(/^(.+?):(.+)$/)
    if (match && match[1].length < 40) {
      html.push(`<p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 6px;"><strong style="color:hsl(245,50%,48%);">${escapeHtml(match[1])}:</strong>${escapeHtml(match[2])}</p>`)
    } else {
      html.push(`<p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 6px;">${escapeHtml(trimmed)}</p>`)
    }
  }
  return html.join('\n')
}

function buildEmailHtml(opts: {
  title: string
  senderLabel: string
  summary: string | null
  questions: { prompt: string | null; answer: string }[]
  transcript: string
  downloadUrl: string | null
  noticeHtml: string
}): string {
  const { title, senderLabel, summary, questions, transcript, downloadUrl, noticeHtml } = opts

  const summarySection = summary
    ? `<div style="margin-bottom:32px;">
        <h2 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid hsl(220,15%,90%);">Summary</h2>
        ${markdownSectionsToHtml(summary)}
      </div>`
    : ''

  const questionsSection = questions.length > 0
    ? `<div style="margin-bottom:32px;">
        <h2 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid hsl(220,15%,90%);">Questions & Answers</h2>
        ${questions.map(q => `
          <div style="margin-bottom:16px;padding:12px 16px;background:hsl(220,20%,97%);border-radius:10px;">
            <p style="font-size:13px;font-weight:600;color:hsl(245,50%,48%);margin:0 0 6px;">Q: ${escapeHtml(q.prompt || '—')}</p>
            <p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.5;margin:0;">${escapeHtml(q.answer)}</p>
          </div>
        `).join('')}
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:28px 28px 20px;border-bottom:1px solid hsl(220,15%,92%);">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 8px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:hsl(220,25%,10%);margin:0;line-height:1.3;">${escapeHtml(title)}</h1>
        ${downloadUrl ? `<div style="margin-top:16px;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 28px;background:hsl(220,25%,10%);color:#fff;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">Download PDF</a><p style="font-size:12px;color:hsl(220,10%,55%);margin:8px 0 0;">Sign in or create a free ${SITE_NAME} account to download. Link expires in 2 days.</p></div>` : ''}
      </div>

      <div style="padding:24px 28px 32px;">
        ${summarySection}
        ${questionsSection}

        <div style="margin-bottom:24px;">
          <h2 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid hsl(220,15%,90%);">Transcript</h2>
          ${formatTranscript(transcript)}
        </div>

        ${noticeHtml}
      </div>

      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">
          Shared by ${escapeHtml(senderLabel)} via <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function buildPlainText(opts: {
  title: string
  senderLabel: string
  summary: string | null
  questions: { prompt: string | null; answer: string }[]
  transcript: string
  downloadUrl: string | null
  noticeText: string
}): string {
  const parts: string[] = [opts.title, '']
  if (opts.downloadUrl) {
    parts.push(`Download PDF (login required): ${opts.downloadUrl}`, '')
  }
  if (opts.summary) {
    parts.push('--- Summary ---', '', opts.summary, '')
  }
  if (opts.questions.length > 0) {
    parts.push('--- Questions & Answers ---', '')
    for (const q of opts.questions) {
      parts.push(`Q: ${q.prompt || '—'}`, `A: ${q.answer}`, '')
    }
  }
  parts.push('--- Transcript ---', '', opts.transcript, '')
  parts.push(opts.noticeText)
  parts.push('', `—`, `Shared by ${opts.senderLabel} via ${SITE_NAME}`)
  return parts.join('\n')
}

function buildLinkOnlyHtml(opts: {
  title: string
  senderLabel: string
  viewUrl: string
  downloadUrl: string | null
  noticeHtml: string
}): string {
  const { title, senderLabel, viewUrl, downloadUrl, noticeHtml } = opts
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:28px 28px 20px;">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 8px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;line-height:1.3;">${escapeHtml(senderLabel)} shared a transcript with you</h1>
        <p style="font-size:15px;color:hsl(220,10%,30%);line-height:1.55;margin:0 0 20px;"><strong>${escapeHtml(title)}</strong></p>
        <p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.55;margin:0 0 20px;">For your privacy, the transcript isn't included in this email. Open the secure link below and we'll send a one-time code to this email address to verify it's you.</p>
        <div style="margin:0 0 12px;">
          <a href="${viewUrl}" style="display:inline-block;padding:12px 28px;background:hsl(245,50%,48%);color:#fff;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">View transcript</a>
        </div>
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0 0 16px;">Link expires in 2 days. Only the address this email was sent to can verify and view it.</p>
        ${downloadUrl ? `<p style="font-size:13px;color:hsl(220,10%,40%);margin:16px 0 0;">Prefer a PDF? <a href="${downloadUrl}" style="color:hsl(245,50%,48%);">Download (sign-in required)</a>.</p>` : ''}
        ${noticeHtml}
      </div>
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">Shared via <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function buildLinkOnlyText(opts: {
  title: string
  senderLabel: string
  viewUrl: string
  downloadUrl: string | null
  noticeText: string
}): string {
  const parts: string[] = [
    `${opts.senderLabel} shared a transcript with you: ${opts.title}`,
    '',
    `For your privacy, the transcript isn't included in this email.`,
    `Open the secure link and we'll send a one-time code to this email address to verify it's you.`,
    '',
    `View transcript: ${opts.viewUrl}`,
    `Link expires in 2 days.`,
  ]
  if (opts.downloadUrl) {
    parts.push('', `Download PDF (sign-in required): ${opts.downloadUrl}`)
  }
  parts.push('', opts.noticeText)
  parts.push('', `— Shared via ${SITE_NAME}`)
  return parts.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const auth = await requireAuth(req.headers.get('Authorization'))
    if (!auth.ok) return auth.response
    const { userId, userClient } = auth
    const user = { id: userId }

    const body = await req.json()
    const job_id = typeof body?.job_id === 'string' ? body.job_id : ''
    const recipient_email = typeof body?.recipient_email === 'string' ? body.recipient_email : ''
    const pdf_storage_path = typeof body?.pdf_storage_path === 'string' && body.pdf_storage_path.trim()
      ? body.pdf_storage_path.trim()
      : null
    // Phase 1: link-only is the default. The full transcript / summary / Q&A is
    // only embedded in the email body when the sender explicitly opted in via
    // the (Phase 2) attestation flow.
    const email_in_body = body?.email_in_body === true
    const attestation_consent_event_id =
      typeof body?.attestation_consent_event_id === 'string' && body.attestation_consent_event_id.trim()
        ? body.attestation_consent_event_id.trim()
        : null

    if (!job_id || !recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (pdf_storage_path && (!pdf_storage_path.startsWith(`${job_id}/`) || pdf_storage_path.includes('..'))) {
      return new Response(JSON.stringify({ error: 'Invalid PDF path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (email_in_body && !attestation_consent_event_id) {
      return new Response(
        JSON.stringify({
          error: 'attestation_required',
          message: 'An uploader attestation is required to include the transcript in the email body.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }


    const serviceClient = createServiceClient()

    // Phase 2: validate uploader attestation when transcript content will be
    // embedded in the email body. The consent_events row must belong to the
    // authenticated sender, be of type `share_uploader_attestation`, and
    // reference a currently-effective consent version.
    let verifiedAttestationId: string | null = null
    if (email_in_body && attestation_consent_event_id) {
      const { data: consentRow, error: consentErr } = await serviceClient
        .from('consent_events')
        .select('id, user_id, consent_type, version')
        .eq('id', attestation_consent_event_id)
        .maybeSingle()

      if (consentErr) {
        console.error('[share-transcript] consent lookup failed', consentErr)
        return new Response(JSON.stringify({ error: 'Consent lookup failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (
        !consentRow ||
        consentRow.user_id !== user.id ||
        consentRow.consent_type !== 'share_uploader_attestation'
      ) {
        return new Response(
          JSON.stringify({ error: 'invalid_attestation' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const now = Date.now()
      const { data: versionRow } = await serviceClient
        .from('consent_versions')
        .select('version, consent_type, effective_from, effective_to')
        .eq('version', consentRow.version)
        .maybeSingle()
      if (
        !versionRow ||
        versionRow.consent_type !== 'share_uploader_attestation' ||
        (versionRow.effective_from && new Date(versionRow.effective_from).getTime() > now) ||
        (versionRow.effective_to && new Date(versionRow.effective_to).getTime() < now)
      ) {
        return new Response(
          JSON.stringify({ error: 'expired_attestation' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      verifiedAttestationId = consentRow.id
    }



    // Quotas: prevent email-bombing a single recipient and cap per-user daily
    // share volume. These run before any heavy work so abuse is cheap to reject.
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

    const { data: job, error: jobError } = await serviceClient
      .from('jobs')
      .select('title, file_name, user_id, speaker_names, output_language, language_detected')
      .eq('id', job_id)
      .maybeSingle()

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: outputs } = await serviceClient
      .from('job_outputs')
      .select('id, output_type, content, custom_prompt')
      .eq('job_id', job_id)
      .order('created_at', { ascending: true })

    // Check if we need to use translated variants
    const activeOutputLang = job.output_language || job.language_detected || 'en'
    const originalLang = job.language_detected || 'en'
    const useVariants = activeOutputLang !== originalLang

    let variantMap: Record<string, string> = {}
    if (useVariants && outputs && outputs.length > 0) {
      const outputIds = outputs.map((o: { id: string }) => o.id)
      const { data: variantRows } = await serviceClient
        .from('job_output_variants')
        .select('job_output_id, content')
        .in('job_output_id', outputIds)
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
      .map((o: { id: string; custom_prompt: string | null; content: string }) => ({ prompt: o.custom_prompt, answer: getContent(o) }))

    if (!transcriptOutput) {
      return new Response(JSON.stringify({ error: 'No transcript available' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const speakerNames = (job.speaker_names ?? {}) as Record<string, string>
    const transformedTranscript = applySpeakerNames(getContent(transcriptOutput), speakerNames)
    const transformedSummary = summaryOutput ? applySpeakerNames(getContent(summaryOutput), speakerNames) : null
    const transformedQuestions = questions.map((q: { prompt: string | null; answer: string }) => ({
      prompt: q.prompt,
      answer: applySpeakerNames(q.answer, speakerNames),
    }))

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'

    // Phase 1: always create a transcript_shares record so the recipient gets
    // a gated view link (OTP-protected). PDF download URL is appended only
    // when a PDF artifact was uploaded.
    const { data: share, error: shareError } = await serviceClient
      .from('transcript_shares')
      .insert({
        job_id,
        recipient_email: recipient_email.toLowerCase().trim(),
        shared_by: user.id,
        email_in_body,
        attestation_consent_event_id: verifiedAttestationId,
      })
      .select('token')
      .single()

    if (shareError || !share) {
      console.error('[share-transcript] failed to create share record', shareError)
      return new Response(JSON.stringify({ error: 'Failed to create share link' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const viewUrl = `${SITE_URL}/share/${share.token}`
    const downloadUrl: string | null = pdf_storage_path
      ? `${SITE_URL}/shared-pdf/${share.token}?path=${encodeURIComponent(pdf_storage_path)}`
      : null

    const messageId = crypto.randomUUID()
    const shortId = messageId.slice(0, 6)

    const notice = await resolveActiveNotice(serviceClient)
    const noticeCtx = { senderLabel, senderEmail, jobShortId: shortId }
    const noticeHtml = notice ? buildNoticeHtml(notice, noticeCtx) : ''
    const noticeText = notice ? buildNoticeText(notice, noticeCtx) : ''
    if (!notice) {
      console.warn('[share-transcript] no active share_recipient_notice version found')
    }

    const html = email_in_body
      ? buildEmailHtml({
          title,
          senderLabel,
          summary: transformedSummary,
          questions: transformedQuestions,
          transcript: transformedTranscript,
          downloadUrl,
          noticeHtml,
        })
      : buildLinkOnlyHtml({
          title,
          senderLabel,
          viewUrl,
          downloadUrl,
          noticeHtml,
        })

    const text = email_in_body
      ? buildPlainText({
          title,
          senderLabel,
          summary: transformedSummary,
          questions: transformedQuestions,
          transcript: transformedTranscript,
          downloadUrl,
          noticeText,
        })
      : buildLinkOnlyText({
          title,
          senderLabel,
          viewUrl,
          downloadUrl,
          noticeText,
        })


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
      template_name: 'share-transcript',
      recipient_email,
      status: 'pending',
    })

    const subjectLine = `Transcript shared with you: ${title} [${shortId}]`

    const { error: enqueueError } = await serviceClient.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        idempotency_key: `share-transcript-${messageId}`,
        to: recipient_email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        reply_to: senderEmail,
        sender_domain: SENDER_DOMAIN,
        subject: subjectLine,
        html,
        text,
        purpose: 'transactional',
        label: 'share-transcript',
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.error('Failed to enqueue share email', { error: enqueueError })
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let noticeLogged = false
    if (notice) {
      noticeLogged = await recordRecipientNotification(serviceClient, {
        jobId: job_id,
        sharedBy: user.id,
        recipientEmail: recipient_email,
        channel: 'share_transcript',
        notice,
        messageId,
      })
      if (!noticeLogged) {
        console.log('[share-transcript] already_notified', { job_id, version: notice.version })
      }
    }


    return new Response(JSON.stringify({ success: true, notice_logged: noticeLogged }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('share-transcript error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})