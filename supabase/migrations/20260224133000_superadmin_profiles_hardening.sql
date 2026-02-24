-- Hardening source of truth for superadmin authorization.
-- admin-create-user authorizes strictly with public.profiles.is_superadmin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_superadmin boolean;

ALTER TABLE public.profiles
  ALTER COLUMN is_superadmin SET DEFAULT false;

UPDATE public.profiles
SET is_superadmin = false
WHERE is_superadmin IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN is_superadmin SET NOT NULL;

-- Keep profile emails normalized and unique by lower(email).
UPDATE public.profiles
SET email = lower(email)
WHERE email IS NOT NULL
  AND email <> lower(email);

CREATE OR REPLACE FUNCTION public.normalize_profile_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_email ON public.profiles;
CREATE TRIGGER trg_normalize_profile_email
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profile_email();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique_idx
  ON public.profiles ((lower(email)))
  WHERE email IS NOT NULL;

-- Bootstrap admin@admin.com as superadmin from auth.users if profile exists or is missing.
INSERT INTO public.profiles (id, email, full_name, is_superadmin)
SELECT u.id, lower(u.email), coalesce(u.raw_user_meta_data->>'full_name', 'Superadmin'), true
FROM auth.users u
WHERE lower(u.email) = 'admin@admin.com'
ON CONFLICT (id) DO UPDATE
SET email = excluded.email,
    is_superadmin = true;

UPDATE public.profiles
SET is_superadmin = true,
    email = lower(email)
WHERE lower(email) = 'admin@admin.com';

-- Manual one-off snippet for operators (replace UUID):
-- UPDATE public.profiles
-- SET is_superadmin = true
-- WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
