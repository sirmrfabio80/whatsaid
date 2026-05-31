/**
 * Admin-only preview endpoint for the share-revocation notification email.
 *
 * Returns the rendered subject / HTML / plain-text body for every canonical
 * scenario defined in `_shared/share-revoke-email.ts` so an admin can
 * visually QA the template before any real email is sent.
 *
 * Auth: requires a signed-in user with the `admin` role. No emails are
 * ever sent — this endpoint is pure rendering.
 */

import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/supabase.ts'
import {
  REVOCATION_PREVIEW_SCENARIOS,
  renderRevocationEmail,
} from '../_shared/share-revoke-email.ts'

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const auth = await requireAdmin(req.headers.get('Authorization'))
  if (!auth.ok) return auth.response

  const previews = REVOCATION_PREVIEW_SCENARIOS.map((scenario) => {
    const rendered = renderRevocationEmail(scenario.input)
    return {
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      input: scenario.input,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }
  })

  return jsonResponse({ previews })
})
