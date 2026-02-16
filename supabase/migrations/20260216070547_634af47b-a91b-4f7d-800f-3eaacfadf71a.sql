
-- Allow editors to update CAPA plans
CREATE POLICY "Update capa"
ON public.capa_plans FOR UPDATE TO authenticated
USING (
  (audit_id IN (SELECT id FROM audits WHERE company_id = get_user_company_id(auth.uid())))
  AND can_edit_content(auth.uid())
);
