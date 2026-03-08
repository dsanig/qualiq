
-- Allow superadmin to update any profile in their company
CREATE POLICY "Superadmin can update profiles in company"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_superadmin(auth.uid()) AND company_id = get_user_company_id(auth.uid()));
