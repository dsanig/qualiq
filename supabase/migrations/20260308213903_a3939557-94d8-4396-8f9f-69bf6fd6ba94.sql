
CREATE TABLE public.document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  download_count int NOT NULL DEFAULT 0
);

ALTER TABLE public.document_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create share links for their company docs"
  ON public.document_share_links FOR INSERT TO authenticated
  WITH CHECK (
    document_id IN (SELECT id FROM public.documents WHERE company_id = get_user_company_id(auth.uid()))
    AND can_edit_content(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can view share links for their company docs"
  ON public.document_share_links FOR SELECT TO authenticated
  USING (
    document_id IN (SELECT id FROM public.documents WHERE company_id = get_user_company_id(auth.uid()))
  );

CREATE POLICY "Users can delete share links for their company docs"
  ON public.document_share_links FOR DELETE TO authenticated
  USING (
    document_id IN (SELECT id FROM public.documents WHERE company_id = get_user_company_id(auth.uid()))
    AND can_edit_content(auth.uid())
  );
