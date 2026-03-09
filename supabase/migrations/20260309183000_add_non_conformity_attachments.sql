CREATE TABLE IF NOT EXISTS public.non_conformity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  non_conformity_id uuid REFERENCES public.non_conformities(id) ON DELETE CASCADE NOT NULL,
  bucket_id text NOT NULL DEFAULT 'documents',
  object_path text NOT NULL,
  file_name text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.non_conformity_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View non conformity attachments" ON public.non_conformity_attachments;
CREATE POLICY "View non conformity attachments" ON public.non_conformity_attachments
  FOR SELECT USING (
    non_conformity_id IN (
      SELECT id FROM public.non_conformities WHERE company_id = get_user_company_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Insert non conformity attachments" ON public.non_conformity_attachments;
CREATE POLICY "Insert non conformity attachments" ON public.non_conformity_attachments
  FOR INSERT WITH CHECK (
    non_conformity_id IN (
      SELECT id FROM public.non_conformities WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_edit_content(auth.uid())
  );

DROP POLICY IF EXISTS "Delete non conformity attachments" ON public.non_conformity_attachments;
CREATE POLICY "Delete non conformity attachments" ON public.non_conformity_attachments
  FOR DELETE USING (
    non_conformity_id IN (
      SELECT id FROM public.non_conformities WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_edit_content(auth.uid())
  );
