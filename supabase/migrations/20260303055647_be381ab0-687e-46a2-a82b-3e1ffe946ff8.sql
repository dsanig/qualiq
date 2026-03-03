
-- Create table to track document status changes
CREATE TABLE public.document_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  comment text
);

-- Enable RLS
ALTER TABLE public.document_status_changes ENABLE ROW LEVEL SECURITY;

-- View: same company members can see status changes
CREATE POLICY "View status changes"
ON public.document_status_changes
FOR SELECT
USING (
  document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
);

-- Insert: users with edit access can insert status changes
CREATE POLICY "Insert status changes"
ON public.document_status_changes
FOR INSERT
WITH CHECK (
  document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);
