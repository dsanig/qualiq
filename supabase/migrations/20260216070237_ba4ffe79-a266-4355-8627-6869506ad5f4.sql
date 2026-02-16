
-- 1. Add deadline to non_conformities
ALTER TABLE public.non_conformities ADD COLUMN IF NOT EXISTS deadline date;

-- 2. Fix document INSERT policy to use can_edit_content (replaces old role-based check)
DROP POLICY IF EXISTS "Users with write access can insert documents" ON public.documents;
CREATE POLICY "Users with write access can insert documents"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  (company_id = get_user_company_id(auth.uid()))
  AND (can_edit_content(auth.uid()) OR is_superadmin(auth.uid()))
);

-- 3. Fix document UPDATE policy
DROP POLICY IF EXISTS "Users with write access can update documents" ON public.documents;
CREATE POLICY "Users with write access can update documents"
ON public.documents FOR UPDATE TO authenticated
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (can_edit_content(auth.uid()) OR is_superadmin(auth.uid()) OR owner_id = auth.uid())
);

-- 4. Fix document DELETE policy
DROP POLICY IF EXISTS "Admins can delete documents" ON public.documents;
CREATE POLICY "Admins can delete documents"
ON public.documents FOR DELETE TO authenticated
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (can_manage_company(auth.uid()) OR is_superadmin(auth.uid()))
);

-- 5. Fix document_versions INSERT policy
DROP POLICY IF EXISTS "Users with write access can insert document versions" ON public.document_versions;
CREATE POLICY "Users with write access can insert document versions"
ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (
  (document_id IN (SELECT id FROM documents WHERE company_id = get_user_company_id(auth.uid())))
  AND can_edit_content(auth.uid())
);

-- 6. Fix document_owners ALL policy
DROP POLICY IF EXISTS "Admins and managers can manage document owners" ON public.document_owners;
CREATE POLICY "Admins and managers can manage document owners"
ON public.document_owners FOR ALL TO authenticated
USING (
  (document_id IN (SELECT id FROM documents WHERE company_id = get_user_company_id(auth.uid())))
  AND can_manage_company(auth.uid())
);

-- 7. Superadmin bypass for viewing all documents
DROP POLICY IF EXISTS "Users can view documents in their company" ON public.documents;
CREATE POLICY "Users can view documents in their company"
ON public.documents FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid()) OR is_superadmin(auth.uid())
);
