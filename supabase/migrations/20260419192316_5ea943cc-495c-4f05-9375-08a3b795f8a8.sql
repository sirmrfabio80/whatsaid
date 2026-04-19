ALTER TABLE public.profiles
  ADD COLUMN preferred_voice text NOT NULL DEFAULT 'female'
    CHECK (preferred_voice IN ('male', 'female')),
  ADD COLUMN playback_speed real NOT NULL DEFAULT 1.0
    CHECK (playback_speed IN (0.75, 1.0, 1.25, 1.5));