// Monitor Google Search Console for crawl/indexing issues on whatsaid.app
// and email an alert when a NEW issue is detected.
// Triggered daily via pg_cron.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://whatsaid.app/'
const SITE_KEY = encodeURIComponent(SITE_URL)
const GATEWAY = 'https://connector-gateway.lovable.dev/google_search_console'
const ALERT_RECIPIENT = 'sirfabio@icloud.com'
const SITE_NAME = 'WhatSaid'
const SENDER_DOMAIN = 'notify.whatsaid.app'
const FROM_DOMAIN = 'whatsaid.app'

interface Finding {
  signature: string
  severity: 'warning' | 'error'
  category: string
  title: string
  details: Record<string, unknown>
}

async function gscFetch(path: string): Promise<Response> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')!
  const gscKey = Deno.env.get('GOOGLE_SEARCH_CONSOLE_API_KEY')!
  return await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': gscKey,
    },
  })
}

async function checkSitemaps(): Promise<Finding[]> {
  const findings: Finding[] = []
  const res = await gscFetch(`/webmasters/v3/sites/${SITE_KEY}/sitemaps`)
  if (!res.ok) {
    findings.push({
      signature: `sitemap-api-error:${res.status}`,
      severity: 'error',
      category: 'sitemap',
      title: 'Cannot read sitemap status from Search Console',
      details: { status: res.status, body: (await res.text()).slice(0, 500) },
    })
    return findings
  }
  const data = await res.json() as { sitemap?: Array<{
    path: string; errors?: number; warnings?: number; isPending?: boolean;
    lastDownloaded?: string; lastSubmitted?: string;
    contents?: Array<{ submitted?: string; indexed?: string; type?: string }>
  }> }
  const sitemaps = data.sitemap ?? []
  if (sitemaps.length === 0) {
    findings.push({
      signature: 'sitemap-missing',
      severity: 'error',
      category: 'sitemap',
      title: 'No sitemap submitted to Search Console',
      details: {},
    })
    return findings
  }
  for (const sm of sitemaps) {
    const errs = Number(sm.errors ?? 0)
    const warns = Number(sm.warnings ?? 0)
    if (errs > 0) {
      findings.push({
        signature: `sitemap-errors:${sm.path}:${errs}`,
        severity: 'error',
        category: 'sitemap',
        title: `Sitemap has ${errs} error(s)`,
        details: { path: sm.path, errors: errs, lastDownloaded: sm.lastDownloaded },
      })
    }
    if (warns > 0) {
      findings.push({
        signature: `sitemap-warnings:${sm.path}:${warns}`,
        severity: 'warning',
        category: 'sitemap',
        title: `Sitemap has ${warns} warning(s)`,
        details: { path: sm.path, warnings: warns, lastDownloaded: sm.lastDownloaded },
      })
    }
    if (sm.lastDownloaded) {
      const ageDays = (Date.now() - new Date(sm.lastDownloaded).getTime()) / 86_400_000
      if (ageDays > 14) {
        findings.push({
          signature: `sitemap-stale:${sm.path}`,
          severity: 'warning',
          category: 'sitemap',
          title: `Sitemap not fetched by Google in ${Math.round(ageDays)} days`,
          details: { path: sm.path, lastDownloaded: sm.lastDownloaded },
        })
      }
    }
    // Coverage: indexed vs submitted
    for (const c of sm.contents ?? []) {
      const submitted = Number(c.submitted ?? 0)
      const indexed = Number(c.indexed ?? 0)
      if (submitted > 0 && indexed === 0) {
        findings.push({
          signature: `sitemap-zero-indexed:${sm.path}:${c.type ?? 'web'}`,
          severity: 'error',
          category: 'indexing',
          title: `0 of ${submitted} ${c.type ?? 'web'} URLs are indexed`,
          details: { path: sm.path, submitted, indexed, type: c.type },
        })
      } else if (submitted > 0 && indexed / submitted < 0.5) {
        findings.push({
          signature: `sitemap-low-indexed:${sm.path}:${c.type ?? 'web'}:${submitted}`,
          severity: 'warning',
          category: 'indexing',
          title: `Only ${indexed} of ${submitted} ${c.type ?? 'web'} URLs indexed (<50%)`,
          details: { path: sm.path, submitted, indexed, type: c.type },
        })
      }
    }
  }
  return findings
}

async function checkRobots(): Promise<Finding[]> {
  const res = await fetch('https://whatsaid.app/robots.txt')
  if (!res.ok) {
    return [{
      signature: `robots-unreachable:${res.status}`,
      severity: 'error',
      category: 'robots',
      title: `robots.txt returned ${res.status}`,
      details: { status: res.status },
    }]
  }
  const text = await res.text()
  if (!/sitemap:/i.test(text)) {
    return [{
      signature: 'robots-missing-sitemap',
      severity: 'warning',
      category: 'robots',
      title: 'robots.txt is missing a Sitemap directive',
      details: {},
    }]
  }
  return []
}

function renderEmailHtml(findings: Finding[]): string {
  const rows = findings.map(f => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;color:${f.severity === 'error' ? '#b91c1c' : '#a16207'};text-transform:uppercase;font-size:11px;">${f.severity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#374151;">${f.category}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#111827;">${f.title}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:20px;color:#111827;margin:0 0 8px;">Search Console alert · whatsaid.app</h1>
      <p style="color:#4b5563;font-size:14px;margin:0 0 20px;">${findings.length} new issue(s) detected during the last scan.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#f9fafb;">
          <th align="left" style="padding:10px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;">Severity</th>
          <th align="left" style="padding:10px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;">Category</th>
          <th align="left" style="padding:10px 12px;font-size:11px;color:#6b7280;text-transform:uppercase;">Issue</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Open Search Console: <a href="https://search.google.com/search-console?resource_id=https%3A%2F%2Fwhatsaid.app%2F" style="color:#4f46e5;">view property</a></p>
    </div></body></html>`
}

function renderEmailText(findings: Finding[]): string {
  return `Search Console alert · whatsaid.app\n\n${findings.length} new issue(s):\n\n` +
    findings.map(f => `[${f.severity.toUpperCase()}] (${f.category}) ${f.title}`).join('\n') +
    `\n\nView: https://search.google.com/search-console?resource_id=https%3A%2F%2Fwhatsaid.app%2F\n`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const findings = [
      ...(await checkSitemaps()),
      ...(await checkRobots()),
    ]

    // Load all open alerts (signatures currently unresolved)
    const { data: openRows } = await supabase
      .from('seo_monitoring_alerts')
      .select('signature, notified_at')
      .is('resolved_at', null)
    const openSet = new Set((openRows ?? []).map(r => r.signature))
    const currentSet = new Set(findings.map(f => f.signature))

    // Mark resolved alerts
    const resolved = [...openSet].filter(s => !currentSet.has(s))
    if (resolved.length) {
      await supabase
        .from('seo_monitoring_alerts')
        .update({ resolved_at: new Date().toISOString() })
        .in('signature', resolved)
    }

    // Upsert current findings + collect NEW ones (not previously notified)
    const newFindings: Finding[] = []
    for (const f of findings) {
      const isOpen = openSet.has(f.signature)
      if (isOpen) {
        await supabase
          .from('seo_monitoring_alerts')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('signature', f.signature)
      } else {
        const { data: inserted } = await supabase
          .from('seo_monitoring_alerts')
          .insert({
            signature: f.signature,
            severity: f.severity,
            category: f.category,
            details: { title: f.title, ...f.details },
          })
          .select('id')
          .single()
        if (inserted) newFindings.push(f)
      }
    }

    let emailed = false
    if (newFindings.length > 0) {
      const messageId = crypto.randomUUID()
      const html = renderEmailHtml(newFindings)
      const text = renderEmailText(newFindings)

      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'seo-monitoring-alert',
        recipient_email: ALERT_RECIPIENT,
        status: 'pending',
      })

      const { error: enqError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: ALERT_RECIPIENT,
          from: `${SITE_NAME} Monitoring <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `[Search Console] ${newFindings.length} new issue(s) on whatsaid.app`,
          html,
          text,
          purpose: 'transactional',
          label: 'seo-monitoring-alert',
          idempotency_key: `seo-alert-${messageId}`,
          queued_at: new Date().toISOString(),
        },
      })

      if (enqError) {
        console.error('Failed to enqueue alert email', enqError)
      } else {
        emailed = true
        await supabase
          .from('seo_monitoring_alerts')
          .update({ notified_at: new Date().toISOString() })
          .in('signature', newFindings.map(f => f.signature))
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      checked: findings.length,
      newAlerts: newFindings.length,
      resolved: resolved.length,
      emailed,
      findings,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('monitor-search-console failed', err)
    return new Response(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
