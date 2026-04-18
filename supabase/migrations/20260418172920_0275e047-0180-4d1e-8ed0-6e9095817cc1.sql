-- Public buckets serve files via the CDN without consulting RLS, so we
-- don't need any SELECT policy for direct URL access. Removing the broad
-- LIST policy clears the linter warning while keeping <img src=...>
-- usage in emails fully functional.
DROP POLICY IF EXISTS "Authenticated users can list email assets" ON storage.objects;