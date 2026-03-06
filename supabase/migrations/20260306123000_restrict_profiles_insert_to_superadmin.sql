-- Restrict profile row creation via RLS to superadmin users only.
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY profiles_insert_superadmin_only
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin(auth.uid()));
