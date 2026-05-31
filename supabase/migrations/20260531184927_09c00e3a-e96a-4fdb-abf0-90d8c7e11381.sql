-- 1) Restrict realtime.messages to deny broadcast/presence.
-- The app uses postgres_changes only, which is authorised via RLS on the
-- source tables. Lock the messages channel so authenticated clients cannot
-- subscribe to arbitrary broadcast/presence topics.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'realtime.messages'::regclass LOOP
    EXECUTE format('DROP POLICY %I ON realtime.messages', r.polname);
  END LOOP;
END$$;

CREATE POLICY "Deny broadcast and presence"
ON realtime.messages
FOR SELECT
TO authenticated
USING (extension = 'postgres_changes');

CREATE POLICY "Deny broadcast and presence writes"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2) Drop the dead guest upload policy on storage.objects.
DROP POLICY IF EXISTS "Guest upload to temp audio" ON storage.objects;
