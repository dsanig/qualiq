-- admin-create-user auth diagnostics + deterministic superadmin source of truth

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_superadmin boolean;

ALTER TABLE public.profiles
  ALTER COLUMN is_superadmin SET DEFAULT false;

UPDATE public.profiles
SET is_superadmin = false
WHERE is_superadmin IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN is_superadmin SET NOT NULL;

UPDATE public.profiles
SET email = lower(email)
WHERE email IS NOT NULL
  AND email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique_idx
  ON public.profiles ((lower(email)))
  WHERE email IS NOT NULL;
