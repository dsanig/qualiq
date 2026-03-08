
-- Allow admins/superadmins to delete simulations and their findings
CREATE POLICY "Admins can delete audit simulations"
ON public.audit_simulations FOR DELETE
TO authenticated
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'Administrador'::app_role)
    OR is_superadmin(auth.uid())
  )
);

CREATE POLICY "Admins can delete audit findings"
ON public.audit_findings FOR DELETE
TO authenticated
USING (
  simulation_id IN (
    SELECT id FROM public.audit_simulations
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'Administrador'::app_role)
    OR is_superadmin(auth.uid())
  )
);
