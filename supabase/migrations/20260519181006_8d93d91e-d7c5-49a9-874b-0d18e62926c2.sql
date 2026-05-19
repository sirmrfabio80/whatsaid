-- Move has_role into a private schema that is not exposed by the REST API.
-- Authenticated users still get EXECUTE so RLS policies can evaluate it,
-- but it no longer appears as a publicly-callable RPC.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Repoint every RLS policy that referenced public.has_role.
DO $$
DECLARE
  pol RECORD;
  using_expr TEXT;
  check_expr TEXT;
  cmd_kw TEXT;
  stmt TEXT;
BEGIN
  FOR pol IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, p.polname,
           p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr,
           p.polroles
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pg_get_expr(p.polqual, p.polrelid) ILIKE '%has_role(%'
       OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%has_role(%'
  LOOP
    using_expr := regexp_replace(COALESCE(pol.using_expr, ''), 'has_role\(', 'private.has_role(', 'g');
    check_expr := regexp_replace(COALESCE(pol.check_expr, ''), 'has_role\(', 'private.has_role(', 'g');
    cmd_kw := CASE pol.polcmd
                WHEN 'r' THEN 'SELECT'
                WHEN 'a' THEN 'INSERT'
                WHEN 'w' THEN 'UPDATE'
                WHEN 'd' THEN 'DELETE'
                WHEN '*' THEN 'ALL'
              END;

    EXECUTE format('DROP POLICY %I ON %I.%I', pol.polname, pol.schema_name, pol.table_name);

    stmt := format('CREATE POLICY %I ON %I.%I FOR %s TO authenticated',
                   pol.polname, pol.schema_name, pol.table_name, cmd_kw);
    IF pol.using_expr IS NOT NULL THEN
      stmt := stmt || ' USING (' || using_expr || ')';
    END IF;
    IF pol.check_expr IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || check_expr || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- Remove the public-schema version so it cannot be invoked via PostgREST.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
