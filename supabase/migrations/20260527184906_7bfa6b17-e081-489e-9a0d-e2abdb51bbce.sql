
-- 1. Column + check + index
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_country_iso2_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_country_iso2_chk
      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS profiles_country_idx ON public.profiles(country);

-- 2. Immutability trigger
CREATE OR REPLACE FUNCTION public.lock_profile_country()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'profiles.country is immutable from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_lock_country ON public.profiles;
CREATE TRIGGER trg_profiles_lock_country
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.lock_profile_country();

-- 3. Update handle_new_user to capture declared country
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country TEXT;
BEGIN
  v_country := NULLIF(upper(NEW.raw_user_meta_data->>'country'), '');
  IF v_country IS NOT NULL AND v_country !~ '^[A-Z]{2}$' THEN
    v_country := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, email, display_name, country)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_country
  );

  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (NEW.id, 0);

  RETURN NEW;
END;
$$;
