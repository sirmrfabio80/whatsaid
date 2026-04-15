import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check profiles.email for other users
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

    // Check auth.users for other users
    const { data: { users } } = await serviceClient.auth.admin.listUsers({
      perPage: 1,
      page: 1,
    })

    // listUsers doesn't filter by email, so use a targeted approach
    const { data: authUsers, error: authListError } = await serviceClient
      .rpc('has_role', { _user_id: user.id, _role: 'admin' }) // dummy call to warm up
      .then(() =>
        // Query auth.users by email using admin API
        serviceClient.auth.admin.listUsers({ perPage: 1000, page: 1 })
      )

    // Simpler: just check if any auth user with this email exists that isn't the current user
    // Use the admin getUserByEmail-like approach
    // Unfortunately listUsers doesn't support email filter, so we'll check via a different approach
    // We can try to look up by email in identities
    const { data: existingAuthUser } = await serviceClient.auth.admin.listUsers({ perPage: 50, page: 1 })

    // Better approach: just try to find users with matching email
    // Since admin.listUsers doesn't filter, let's use a direct approach
    let authEmailTaken = false
    if (existingAuthUser?.users) {
      authEmailTaken = existingAuthUser.users.some(
        u => u.id !== user.id && u.email?.toLowerCase() === email
      )
    }

    if (authEmailTaken) {
      return new Response(JSON.stringify({ available: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ available: true }), {
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
