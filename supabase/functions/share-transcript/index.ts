import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SITE_NAME = 'WhatSaid'
const SITE_URL = 'https://whatsaid.app'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function markdownSectionsToHtml(content: string): string {
  // Convert markdown-style sections (## Heading, **bold**, - bullets) to HTML
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
    // Speaker label pattern: "Speaker A:" or custom name
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
  senderEmail: string
  summary: string | null
  questions: { prompt: string | null; answer: string }[]
  transcript: string
}): string {
  const { title, senderEmail, summary, questions, transcript } = opts

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
      <!-- Header -->
      <div style="padding:28px 28px 20px;border-bottom:1px solid hsl(220,15%,92%);">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 8px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;color:hsl(220,25%,10%);margin:0;line-height:1.3;">${escapeHtml(title)}</h1>
      </div>

      <!-- Body -->
      <div style="padding:24px 28px 32px;">
        ${summarySection}
        ${questionsSection}

        <div style="margin-bottom:24px;">
          <h2 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid hsl(220,15%,90%);">Transcript</h2>
          ${formatTranscript(transcript)}
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">
          Shared by ${escapeHtml(senderEmail)} via <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function buildPlainText(opts: {
  title: string
  senderEmail: string
  summary: string | null
  questions: { prompt: string | null; answer: string }[]
  transcript: string
}): string {
  const parts: string[] = [opts.title, '']
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
  parts.push(`—`, `Shared by ${opts.senderEmail} via ${SITE_NAME}`)
  return parts.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { job_id, recipient_email } = await req.json()
    if (!job_id || !recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch job (ensure it belongs to the user)
    const { data: job, error: jobError } = await serviceClient
      .from('jobs')
      .select('title, file_name, user_id')
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

    // Fetch outputs
    const { data: outputs } = await serviceClient
      .from('job_outputs')
      .select('output_type, content, custom_prompt')
      .eq('job_id', job_id)
      .order('created_at', { ascending: true })

    const transcript = outputs?.find(o => o.output_type === 'transcript')
    const summary = outputs?.find(o => o.output_type === 'summary')
    const questions = (outputs ?? [])
      .filter(o => o.output_type === 'custom' || o.output_type === 'question')
      .map(o => ({ prompt: o.custom_prompt, answer: o.content }))

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'No transcript available' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const title = job.title || job.file_name?.replace(/\.[^.]+$/, '') || 'Transcript'

    const html = buildEmailHtml({
      title,
      senderEmail: user.email || 'someone',
      summary: summary?.content || null,
      questions,
      transcript: transcript.content,
    })

    const text = buildPlainText({
      title,
      senderEmail: user.email || 'someone',
      summary: summary?.content || null,
      questions,
      transcript: transcript.content,
    })

    // Enqueue email via the existing queue system
    const messageId = crypto.randomUUID()
    const SENDER_DOMAIN = 'notify.whatsaid.app'
    const FROM_DOMAIN = 'whatsaid.app'

    // Get or create unsubscribe token for recipient
    const { data: existingToken } = await serviceClient
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', recipient_email.toLowerCase())
      .maybeSingle()

    let unsubscribeToken = existingToken?.token
    if (!unsubscribeToken) {
      unsubscribeToken = crypto.randomUUID()
      await serviceClient.from('email_unsubscribe_tokens').insert({
        email: recipient_email.toLowerCase(),
        token: unsubscribeToken,
      })
    }

    await serviceClient.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'share-transcript',
      recipient_email,
      status: 'pending',
    })

    const { error: enqueueError } = await serviceClient.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        idempotency_key: `share-transcript-${messageId}`,
        to: recipient_email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: title,
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('share-transcript error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
