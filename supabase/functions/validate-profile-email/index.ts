import { corsHeaders } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const auth = await requireAuth(req.headers.get('Authorization'))
    if (!auth.ok) return auth.response
    const { userId, email: userEmail } = auth
    const user = { id: userId, email: userEmail }

    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createServiceClient()

    // 1. Check if another user's profile already uses this email
    const { data: profileMatch } = await serviceClient
      .from('profiles')
      .select('user_id')
      .ilike('email', email)
      .neq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (profileMatch) {
      return new Response(JSON.stringify({ available: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Check if another auth user has this email
    // Use admin.listUsers and filter — Supabase admin API doesn't support email filter directly
    // For small user bases this is fine; for larger ones a DB function would be better
    const { data: listing } = await serviceClient.auth.admin.listUsers({ perPage: 1000, page: 1 })
    const authEmailTaken = listing?.users?.some(
      u => u.id !== user.id && u.email?.toLowerCase() === email
    ) ?? false

    return new Response(JSON.stringify({ available: !authEmailTaken }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('validate-profile-email error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
