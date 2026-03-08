CREATE POLICY "Company members can update predictive insights"
ON public.predictive_insights
FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company admins can delete predictive insights"
ON public.predictive_insights
FOR DELETE
TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND can_manage_company(auth.uid()));