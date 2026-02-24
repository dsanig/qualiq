-- Align role source-of-truth data so superadmin checks are reliable across UI and Edge Functions.
-- Source of truth:
--   - public.profiles.is_superadmin for Superadmin privilege.
--   - public.user_roles.role for assignable app roles.

INSERT INTO public.profiles (id, email, full_name, is_superadmin)
SELECT
  u.id,
  lower(u.email),
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  false
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  email = COALESCE(EXCLUDED.email, public.profiles.email),
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

UPDATE public.profiles
SET is_superadmin = true,
    email = lower(email)
WHERE lower(email) = 'admin@admin.com';
