-- Phase 2: Tighten public bucket LIST policies
-- The previous policies allowed any client to enumerate all files in the
-- bucket via a SELECT/list call. We replace them with policies that:
--   • avatars: owner-scoped listing (path prefix = auth.uid())
--   • email-assets: authenticated-only listing
-- Direct fetches by URL still work for both buckets because they are
-- public buckets — those go through the storage CDN and bypass RLS.

-- ---- avatars ----
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can list own avatar files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ---- email-assets ----
DROP POLICY IF EXISTS "Email assets are publicly accessible" ON storage.objects;

CREATE POLICY "Authenticated users can list email assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'email-assets');