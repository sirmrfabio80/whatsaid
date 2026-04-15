

## Delete Account — Full Implementation

### Problem
The "Delete my account" button has no handler. It needs to securely delete the user and all their data.

### Data to delete (in order, to respect dependencies)
1. **job_output_variants** — via job_outputs → jobs owned by user
2. **job_outputs** — via jobs owned by user
3. **job_tags** — where job belongs to user
4. **jobs** — where user_id = user
5. **tags** — where user_id = user
6. **transcript_shares** — where shared_by = user
7. **credit_transactions** — where user_id = user
8. **credit_balances** — where user_id = user
9. **notifications** — where user_id = user
10. **async_jobs** — where user_id = user
11. **user_roles** — where user_id = user
12. **profiles** — where user_id = user
13. **Storage**: avatars bucket (user folder), shared-pdfs, exports
14. **Auth user**: `auth.admin.deleteUser(userId)` via service role

### Implementation

**1. Create edge function `supabase/functions/delete-account/index.ts`**
- Authenticates via JWT from the request
- Uses service role client to delete all rows from the tables listed above
- Deletes storage objects in avatars/shared-pdfs/exports buckets belonging to the user
- Calls `auth.admin.deleteUser(userId)` last
- Returns 200 on success

**2. Update `src/pages/Settings.tsx`**
- Add `onClick` to the `AlertDialogAction` button
- Call `supabase.functions.invoke('delete-account')`
- On success: call `signOut()`, navigate to `/`
- Add loading state, show toast on error

**3. Add locale strings** to `en.json`, `it.json`, `fr.json`
- `settings.deletingAccount`, `settings.deleteError`, `settings.deleteSuccess`

### Files
- **Create**: `supabase/functions/delete-account/index.ts`
- **Edit**: `src/pages/Settings.tsx`, `src/i18n/locales/en.json`, `it.json`, `fr.json`

