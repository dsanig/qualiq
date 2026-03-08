
-- Add new columns to audits table
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS observations text,
  ADD COLUMN IF NOT EXISTS findings text,
  ADD COLUMN IF NOT EXISTS conclusions text;

-- Create audit_attachments table
CREATE TABLE IF NOT EXISTS public.audit_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'documents',
  object_path text NOT NULL,
  file_name text,
  file_type text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: View audit attachments (same company)
CREATE POLICY "View audit attachments"
  ON public.audit_attachments FOR SELECT
  USING (audit_id IN (
    SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())
  ));

-- RLS: Insert audit attachments (editors)
CREATE POLICY "Insert audit attachments"
  ON public.audit_attachments FOR INSERT
  WITH CHECK (
    audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid()))
    AND can_edit_content(auth.uid())
  );

-- RLS: Delete audit attachments (editors)
CREATE POLICY "Delete audit attachments"
  ON public.audit_attachments FOR DELETE
  USING (
    audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid()))
    AND can_edit_content(auth.uid())
  );

-- Add DELETE policy for audits (admin/superadmin only)
CREATE POLICY "Delete audits"
  ON public.audits FOR DELETE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (can_manage_company(auth.uid()) OR is_superadmin(auth.uid()))
  );
