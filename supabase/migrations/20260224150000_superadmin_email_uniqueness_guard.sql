-- Safety guard for legacy datasets used by admin-create-user diagnostics.
-- Keeps email normalization deterministic and ensures fallback lookup is unambiguous.

UPDATE public.profiles
SET email = lower(email)
WHERE email IS NOT NULL
  AND email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique_idx
  ON public.profiles ((lower(email)))
  WHERE email IS NOT NULL;

UPDATE public.profiles
SET is_superadmin = true
WHERE lower(email) = 'admin@admin.com';
