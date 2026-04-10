
-- Create app_role enum for future use
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Credit balances
CREATE TABLE public.credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance" ON public.credit_balances FOR SELECT USING (auth.uid() = user_id);

-- Credit transactions (log)
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  stripe_session_id TEXT,
  job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Job status enum
CREATE TYPE public.job_status AS ENUM ('pending', 'uploading', 'processing', 'completed', 'failed');

-- Jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_token UUID DEFAULT gen_random_uuid(),
  guest_email TEXT,
  status public.job_status NOT NULL DEFAULT 'pending',
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  language_detected TEXT,
  language_selected TEXT,
  temp_file_path TEXT,
  audio_deleted_at TIMESTAMPTZ,
  stripe_payment_id TEXT,
  error_message TEXT,
  regeneration_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Job outputs
CREATE TABLE public.job_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL CHECK (output_type IN ('transcript', 'summary', 'custom')),
  content TEXT NOT NULL DEFAULT '',
  custom_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.job_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view outputs of own jobs" ON public.job_outputs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_outputs.job_id AND jobs.user_id = auth.uid()));

-- Atomic credit deduction function
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount INTEGER, p_reason TEXT, p_job_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.credit_balances
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, reason, job_id)
  VALUES (p_user_id, -p_amount, p_reason, p_job_id);

  RETURN TRUE;
END;
$$;

-- Add credits function (for Stripe webhook)
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id UUID, p_amount INTEGER, p_reason TEXT, p_stripe_session_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = credit_balances.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (user_id, amount, reason, stripe_session_id)
  VALUES (p_user_id, p_amount, p_reason, p_stripe_session_id);

  RETURN v_new_balance;
END;
$$;

-- Auto-create profile + credit balance on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (NEW.id, 0);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Temp audio storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-audio', 'temp-audio', false);

-- Authenticated users can upload to their folder
CREATE POLICY "Users can upload audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'temp-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Anyone can upload to guest folder (edge functions handle validation)
CREATE POLICY "Guest upload to temp audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'temp-audio' AND (storage.foldername(name))[1] = 'guest');

-- Service role can read/delete (edge functions use service role)
CREATE POLICY "Read temp audio" ON storage.objects FOR SELECT
  USING (bucket_id = 'temp-audio');

CREATE POLICY "Delete temp audio" ON storage.objects FOR DELETE
  USING (bucket_id = 'temp-audio');
