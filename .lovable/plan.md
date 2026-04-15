

## Plan: Dual-email check in edge functions

### What changes

Both `claim-transcript-share` and `download-shared-pdf` currently check only `user.email` (auth email) against `share.recipient_email`. We'll add a `profiles.email` lookup and accept access if **either** matches.

### Changes per file

**1. `supabase/functions/claim-transcript-share/index.ts` (lines ~107-114)**
- After getting `userEmail` from auth, query `profiles.email` via `serviceClient` using `user.id`
- Accept if either `userEmail` or `profileEmail` matches `share.recipient_email`
- Log which email matched (auth vs profile)
- Keep 403 with clear message if neither matches

**2. `supabase/functions/download-shared-pdf/index.ts` (lines ~77-83)**
- Same pattern: fetch `profiles.email`, dual-check, log match type
- Keep 403 if neither matches

### Pattern (applied identically in both files)

```typescript
const userEmail = user.email?.toLowerCase().trim()
const recipientEmail = share.recipient_email.toLowerCase().trim()

const { data: profile } = await serviceClient
  .from('profiles')
  .select('email')
  .eq('user_id', user.id)
  .maybeSingle()
const profileEmail = profile?.email?.toLowerCase().trim()

const authMatch = userEmail === recipientEmail
const profileMatch = !!profileEmail && profileEmail === recipientEmail

if (!authMatch && !profileMatch) {
  console.log(`Email mismatch: auth=${userEmail}, profile=${profileEmail}, recipient=${recipientEmail}`)
  return new Response(JSON.stringify({ error: `...shared with ${share.recipient_email}...` }), { status: 403 })
}

console.log(`Access granted via ${authMatch ? 'auth' : 'profile'} email match`)
```

### No other changes
- No frontend files touched
- No unrelated refactoring
- No database migrations needed (`profiles.email` column already exists)

