
-- Drop overly permissive storage policies that allow cross-company access
DROP POLICY IF EXISTS "Auth read docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth update docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload docs" ON storage.objects;

-- Drop old policies with incorrect role checks
DROP POLICY IF EXISTS "Users with write access can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Users with write access can upload documents" ON storage.objects;

-- Recreate proper company-isolated storage policies

-- SELECT: only documents in user's company folder
-- (keep existing "Users can view documents in their company" policy)

-- INSERT: company-isolated with proper role check
CREATE POLICY "Company users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT companies.id::text FROM companies
    WHERE companies.id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);

-- UPDATE: company-isolated with proper role check  
CREATE POLICY "Company users can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT companies.id::text FROM companies
    WHERE companies.id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);

-- DELETE: fix existing policy to also use can_manage_company instead of just admin role
DROP POLICY IF EXISTS "Admins can delete documents from storage" ON storage.objects;
CREATE POLICY "Admins can delete documents from storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT companies.id::text FROM companies
    WHERE companies.id = get_user_company_id(auth.uid())
  )
  AND can_manage_company(auth.uid())
);
