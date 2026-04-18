import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders as baseCorsHeaders } from '../_shared/cors.ts'

// Augment shared CORS with Content-Disposition exposure so the browser can
// read the suggested filename when streaming the PDF back to the client.
const corsHeaders = {
  ...baseCorsHeaders,
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type',
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'transcript'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const token = typeof body?.token === 'string' ? body.token : ''
    const pdf_storage_path = typeof body?.pdf_storage_path === 'string' ? body.pdf_storage_path : ''

    if (!token || !pdf_storage_path) {
      return new Response(JSON.stringify({ error: 'Token and PDF path are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: share } = await serviceClient
      .from('transcript_shares')
      .select('job_id, recipient_email, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!share) {
      return new Response(JSON.stringify({ error: 'This PDF link is not valid.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This PDF link has expired.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userEmail = user.email?.toLowerCase().trim()
    const recipientEmail = share.recipient_email.toLowerCase().trim()

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle()
    const profileEmail = profile?.email?.toLowerCase().trim()

    const authMatch = !!userEmail && userEmail === recipientEmail
    const profileMatch = !!profileEmail && profileEmail === recipientEmail

    if (!authMatch && !profileMatch) {
      console.log(`Email mismatch — access denied`)
      return new Response(JSON.stringify({ error: "You don't have access to this PDF." }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Access granted via ${authMatch ? 'auth' : 'profile'} email match`)

    if (!pdf_storage_path.startsWith(`${share.job_id}/`) || pdf_storage_path.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid PDF path.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: job } = await serviceClient
      .from('jobs')
      .select('title, file_name')
      .eq('id', share.job_id)
      .maybeSingle()

    const { data: pdfBlob, error: downloadError } = await serviceClient.storage
      .from('shared-pdfs')
      .download(pdf_storage_path)

    if (downloadError || !pdfBlob) {
      return new Response(JSON.stringify({ error: 'PDF not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const filenameBase = sanitizeFilename(job?.title || job?.file_name || 'transcript')
    const buffer = await pdfBlob.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('download-shared-pdf error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})