
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create audit simulations" ON public.audit_simulations;
DROP POLICY IF EXISTS "Admins can update audit simulations" ON public.audit_simulations;

-- Recreate with support for both admin roles + superadmin
CREATE POLICY "Admins can create audit simulations"
ON public.audit_simulations FOR INSERT
TO authenticated
WITH CHECK (
  (company_id = get_user_company_id(auth.uid()))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'Administrador'::app_role)
    OR is_superadmin(auth.uid())
    OR can_edit_content(auth.uid())
  )
);

CREATE POLICY "Admins can update audit simulations"
ON public.audit_simulations FOR UPDATE
TO authenticated
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'Administrador'::app_role)
    OR is_superadmin(auth.uid())
    OR can_edit_content(auth.uid())
  )
);
