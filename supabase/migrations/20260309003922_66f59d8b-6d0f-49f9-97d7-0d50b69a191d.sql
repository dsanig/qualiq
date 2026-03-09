-- Add company_id column to capa_plans and make audit_id nullable
ALTER TABLE public.capa_plans 
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.capa_plans 
  ALTER COLUMN audit_id DROP NOT NULL;

-- Backfill company_id from audits for existing records
UPDATE public.capa_plans cp
SET company_id = a.company_id
FROM public.audits a
WHERE cp.audit_id = a.id AND cp.company_id IS NULL;

-- Drop old RLS policies on capa_plans
DROP POLICY IF EXISTS "View CAPA plans" ON public.capa_plans;
DROP POLICY IF EXISTS "Insert CAPA plans" ON public.capa_plans;
DROP POLICY IF EXISTS "Update CAPA plans" ON public.capa_plans;
DROP POLICY IF EXISTS "Delete CAPA plans" ON public.capa_plans;

-- Create new RLS policies for capa_plans that support independent plans
CREATE POLICY "View CAPA plans" ON public.capa_plans
  FOR SELECT TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()))
    OR 
    (audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())))
  );

CREATE POLICY "Insert CAPA plans" ON public.capa_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    can_edit_content(auth.uid()) AND
    (
      (company_id = get_user_company_id(auth.uid()))
      OR 
      (audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())))
    )
  );

CREATE POLICY "Update CAPA plans" ON public.capa_plans
  FOR UPDATE TO authenticated
  USING (
    can_edit_content(auth.uid()) AND
    (
      (company_id = get_user_company_id(auth.uid()))
      OR 
      (audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())))
    )
  );

CREATE POLICY "Delete CAPA plans" ON public.capa_plans
  FOR DELETE TO authenticated
  USING (
    (can_manage_company(auth.uid()) OR is_superadmin(auth.uid())) AND
    (
      (company_id = get_user_company_id(auth.uid()))
      OR 
      (audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())))
    )
  );