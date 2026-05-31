/**
 * Shared rendering for the share-revocation notification email.
 *
 * Centralised so both the live sender (`share-revoke`) and the internal
 * admin preview endpoint (`preview-share-revoke-email`) produce byte-for-byte
 * identical output. Pure functions only — no I/O, no env reads.
 *
 * Hard rendering caps:
 *  - title shown in subject/body is truncated to MAX_TITLE_DISPLAY chars
 *  - reason is truncated to MAX_REASON_DISPLAY chars (already capped at
 *    intake by share-revoke; the second cap protects preview/legacy data)
 *  - revoker label is truncated to MAX_REVOKER_DISPLAY chars to avoid a
 *    400-char display name blowing out the email layout
 *  - subject line is stripped of CR/LF/control chars and capped to
 *    MAX_SUBJECT_LENGTH chars so it cannot inject MIME headers or wrap
 *    awkwardly in mail clients
 */

import { SITE_NAME, SITE_URL } from './constants.ts'

export const MAX_TITLE_DISPLAY = 140
export const MAX_REASON_DISPLAY = 500
export const MAX_REVOKER_DISPLAY = 120
export const MAX_SUBJECT_LENGTH = 150

export interface RevocationEmailInput {
  title: string
  reason: string | null
  revokerLabel: string | null
}

export interface RenderedRevocationEmail {
  subject: string
  html: string
  text: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Truncate with an ellipsis if `value` exceeds `max` graphemes-ish (chars). */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  // Reserve 1 char for the ellipsis so the result stays within `max`.
  return value.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

/** Strip control chars (CR/LF/tab + C0/C1) that could break MIME headers. */
function sanitiseHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Compose the subject line. The scenario (reason vs revoker presence) is
 * reflected in the subject so recipients see at-a-glance context without
 * exposing the full reason text in the header.
 *
 * Scenarios:
 *  - both / revoker only → `Transcript access revoked by <name>: <title>`
 *  - reason only         → `Transcript access revoked: <title> — reason provided`
 *  - neither             → `Transcript access revoked: <title>`
 */
export function buildRevocationSubject(input: RevocationEmailInput): string {
  const title = truncate(sanitiseHeader(input.title || 'transcript'), MAX_TITLE_DISPLAY)
  const revoker = input.revokerLabel
    ? truncate(sanitiseHeader(input.revokerLabel), MAX_REVOKER_DISPLAY)
    : null
  const hasReason = Boolean(input.reason && input.reason.trim())

  let subject: string
  if (revoker) {
    subject = `Transcript access revoked by ${revoker}: ${title}`
  } else if (hasReason) {
    subject = `Transcript access revoked: ${title} — reason provided`
  } else {
    subject = `Transcript access revoked: ${title}`
  }

  subject = sanitiseHeader(subject)
  if (subject.length > MAX_SUBJECT_LENGTH) {
    subject = subject.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd() + '…'
  }
  return subject
}

export function buildRevocationHtml(input: RevocationEmailInput): string {
  const title = truncate(input.title || 'Transcript', MAX_TITLE_DISPLAY)
  const reason = input.reason ? truncate(input.reason, MAX_REASON_DISPLAY) : null
  const revokerLabel = input.revokerLabel
    ? truncate(input.revokerLabel, MAX_REVOKER_DISPLAY)
    : null

  // `word-break:break-word` + `overflow-wrap:anywhere` ensures very long
  // unbroken strings (e.g. a 200-char display name with no spaces, or a URL
  // pasted into the reason) wrap inside the card instead of pushing the
  // layout wider than the 560px container.
  const wrapStyle =
    'word-break:break-word;overflow-wrap:anywhere;'

  const reasonBlock = reason
    ? `<p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 12px;${wrapStyle}"><strong>Reason given:</strong> ${escapeHtml(reason)}</p>`
    : ''
  const revokerBlock = revokerLabel
    ? `<p style="font-size:14px;color:hsl(220,10%,30%);line-height:1.6;margin:0 0 12px;${wrapStyle}"><strong>Revoked by:</strong> ${escapeHtml(revokerLabel)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="padding:28px 28px 20px;">
        <p style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:hsl(245,50%,48%);margin:0 0 8px;">${SITE_NAME}</p>
        <h1 style="font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;font-weight:700;color:hsl(220,25%,10%);margin:0 0 12px;line-height:1.3;${wrapStyle}">Transcript access revoked</h1>
        <p style="font-size:15px;color:hsl(220,10%,30%);line-height:1.55;margin:0 0 20px;${wrapStyle}">Access to <strong>${escapeHtml(title)}</strong> has been revoked. The secure link no longer works and no further views are possible.</p>
        ${reasonBlock}
        ${revokerBlock}
        <p style="font-size:13px;color:hsl(220,10%,55%);margin:16px 0 0;line-height:1.5;">If you think this was a mistake, contact the person who shared the transcript with you.</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid hsl(220,15%,92%);background:hsl(220,20%,97%);">
        <p style="font-size:12px;color:hsl(220,10%,55%);margin:0;line-height:1.5;">Sent by <a href="${SITE_URL}" style="color:hsl(245,50%,48%);text-decoration:none;font-weight:500;">${SITE_NAME}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function buildRevocationText(input: RevocationEmailInput): string {
  const title = truncate(input.title || 'Transcript', MAX_TITLE_DISPLAY)
  const reason = input.reason ? truncate(input.reason, MAX_REASON_DISPLAY) : null
  const revokerLabel = input.revokerLabel
    ? truncate(input.revokerLabel, MAX_REVOKER_DISPLAY)
    : null

  const parts: string[] = [
    `Transcript access revoked · ${SITE_NAME}`,
    '',
    `Access to "${title}" has been revoked. The secure link no longer works.`,
  ]
  if (reason) parts.push('', `Reason given: ${reason}`)
  if (revokerLabel) parts.push('', `Revoked by: ${revokerLabel}`)
  parts.push(
    '',
    'If you think this was a mistake, contact the person who shared the transcript with you.',
    '',
    `— ${SITE_NAME}`,
  )
  return parts.join('\n')
}

export function renderRevocationEmail(
  input: RevocationEmailInput,
): RenderedRevocationEmail {
  return {
    subject: buildRevocationSubject(input),
    html: buildRevocationHtml(input),
    text: buildRevocationText(input),
  }
}

/** Canonical preview scenarios used by the admin preview endpoint. */
export interface RevocationPreviewScenario {
  id: string
  label: string
  description: string
  input: RevocationEmailInput
}

const LONG_REASON =
  'The recipient requested deletion after noticing the transcript contained the names of two clinical trial participants who had not consented to onward sharing. ' +
  'Revoking immediately and re-issuing a redacted version once the participants have been contacted and a fresh attestation has been recorded. ' +
  'This reason is intentionally long to stress-test wrapping inside the email card. https://example.com/incident/2026-06-01/redaction-followup-ticket-INC-00481-attachment-summary-redaction-plan'

const LONG_REVOKER =
  'Dr. Alexandra-Marguerite van der Berg-Whittlesworth (Data Protection Officer, North-Western Regional Compliance Office, Department of Clinical Research Oversight)'

export const REVOCATION_PREVIEW_SCENARIOS: RevocationPreviewScenario[] = [
  {
    id: 'neither',
    label: 'Neither reason nor revoker',
    description: 'Anonymous revocation via the public token link with no reason supplied.',
    input: { title: 'Q2 board meeting recording', reason: null, revokerLabel: null },
  },
  {
    id: 'reason-only',
    label: 'Reason only',
    description: 'Revoked via public token with a short reason; revoker identity unknown.',
    input: {
      title: 'Q2 board meeting recording',
      reason: 'Sent to the wrong recipient by mistake.',
      revokerLabel: null,
    },
  },
  {
    id: 'revoker-only',
    label: 'Revoker only',
    description: 'Signed-in sender revoked the share without entering a reason.',
    input: {
      title: 'Q2 board meeting recording',
      reason: null,
      revokerLabel: 'Fabio Petito',
    },
  },
  {
    id: 'both',
    label: 'Reason + revoker',
    description: 'Signed-in sender revoked with an explanatory reason.',
    input: {
      title: 'Q2 board meeting recording',
      reason: 'Replaced by a redacted version; please discard.',
      revokerLabel: 'Fabio Petito',
    },
  },
  {
    id: 'long-values',
    label: 'Extreme lengths (stress test)',
    description:
      'Reason and revoker exceed normal lengths to verify truncation, word-wrap and that the card layout stays within 560px.',
    input: {
      title:
        'Confidential interview — North-Western Regional Compliance review v3 (rev. 2026-06-01) FINAL_FINAL.m4a',
      reason: LONG_REASON,
      revokerLabel: LONG_REVOKER,
    },
  },
  {
    id: 'xss-attempt',
    label: 'XSS / control char attempt',
    description:
      'Hostile input including HTML tags, quotes and a CR/LF injection attempt in the title. Verifies HTML escaping and subject sanitisation.',
    input: {
      title: 'Project "Alpha"\r\nBcc: attacker@example.com <script>alert(1)</script>',
      reason: '<script>alert("xss")</script> & "quotes" <b>bold</b>',
      revokerLabel: '<img src=x onerror=alert(1)> "Bobby Tables"',
    },
  },
]
