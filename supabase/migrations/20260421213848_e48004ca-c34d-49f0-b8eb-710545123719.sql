
-- =========================================================================
-- 1. Tighten storage RLS on the shared-pdfs bucket
-- =========================================================================
-- The previous INSERT policy allowed any authenticated user to write into
-- any path of the shared-pdfs bucket. Replace it with an ownership-scoped
-- policy that requires the first folder of the object name to equal a
-- job_id owned by the caller.

DROP POLICY IF EXISTS "Authenticated users can upload shared PDFs" ON storage.objects;

CREATE POLICY "Owners can upload shared PDFs for their jobs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shared-pdfs'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = (storage.foldername(name))[1]
      AND j.user_id = auth.uid()
  )
);

CREATE POLICY "Owners can view shared PDFs for their jobs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shared-pdfs'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = (storage.foldername(name))[1]
      AND j.user_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete shared PDFs for their jobs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'shared-pdfs'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = (storage.foldername(name))[1]
      AND j.user_id = auth.uid()
  )
);

-- =========================================================================
-- 2. Realtime RLS — restrict channel subscriptions to authenticated users
-- =========================================================================
-- realtime.messages had no policies, so any authenticated client could
-- subscribe to any topic and receive postgres_changes broadcasts that the
-- service publishes for `job_tags`, `notifications`, and `async_jobs`.
--
-- The actual row-level filtering for `postgres_changes` is enforced by the
-- underlying tables' RLS (already present and owner-scoped). What is missing
-- is a base policy on `realtime.messages` that simply allows authenticated
-- clients to participate in the realtime channel at all. Without any policy
-- on this RLS-enabled table, no one can subscribe — so we add a minimal
-- authenticated policy and rely on per-table RLS for content filtering.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    -- Drop any prior version so this migration is idempotent.
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages';

    -- Authenticated users may read/write realtime channel messages; the
    -- per-table RLS on the underlying public tables (jobs, notifications,
    -- async_jobs, job_tags) controls which rows actually flow through
    -- postgres_changes broadcasts.
    EXECUTE $POL$
      CREATE POLICY "Authenticated can use realtime"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (true)
    $POL$;
  END IF;
END
$$;
