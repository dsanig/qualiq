
CREATE POLICY "Admins can delete predictive insights"
ON public.predictive_insights
FOR DELETE
TO authenticated
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (can_manage_company(auth.uid()) OR is_superadmin(auth.uid()))
);
