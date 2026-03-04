
-- Table for document responsibilities (multiple users with different action types per document)
CREATE TABLE public.document_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL, -- 'firma', 'aprobacion', 'revision'
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.document_responsibilities ENABLE ROW LEVEL SECURITY;

-- View: company members can see responsibilities for their company's documents
CREATE POLICY "View document responsibilities"
  ON public.document_responsibilities
  FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM public.documents
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

-- Insert: editors can add responsibilities
CREATE POLICY "Insert document responsibilities"
  ON public.document_responsibilities
  FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.documents
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_edit_content(auth.uid())
  );

-- Update: editors can update (e.g. mark complete)
CREATE POLICY "Update document responsibilities"
  ON public.document_responsibilities
  FOR UPDATE
  USING (
    document_id IN (
      SELECT id FROM public.documents
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_edit_content(auth.uid())
  );

-- Delete: editors can remove responsibilities
CREATE POLICY "Delete document responsibilities"
  ON public.document_responsibilities
  FOR DELETE
  USING (
    document_id IN (
      SELECT id FROM public.documents
      WHERE company_id = get_user_company_id(auth.uid())
    )
    AND can_edit_content(auth.uid())
  );
