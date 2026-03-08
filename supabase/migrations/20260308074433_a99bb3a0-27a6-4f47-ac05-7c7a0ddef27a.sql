
-- Training records (formaciones impartidas)
CREATE TABLE public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  title text NOT NULL,
  description text,
  contents text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training records" ON public.training_records
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Insert training records" ON public.training_records
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND can_edit_content(auth.uid()));

CREATE POLICY "Update training records" ON public.training_records
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND can_edit_content(auth.uid()));

CREATE POLICY "Delete training records" ON public.training_records
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND (can_manage_company(auth.uid()) OR is_superadmin(auth.uid())));

-- Documents linked to a training record
CREATE TABLE public.training_record_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_record_id uuid NOT NULL REFERENCES public.training_records(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_record_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training record documents" ON public.training_record_documents
  FOR SELECT TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Manage training record documents" ON public.training_record_documents
  FOR ALL TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Participants (trainers & trainees)
CREATE TABLE public.training_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_record_id uuid NOT NULL REFERENCES public.training_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('trainer', 'trainee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(training_record_id, user_id, role)
);

ALTER TABLE public.training_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training participants" ON public.training_participants
  FOR SELECT TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Manage training participants" ON public.training_participants
  FOR ALL TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Signatures for training participants
CREATE TABLE public.training_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_record_id uuid NOT NULL REFERENCES public.training_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  signer_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('trainer', 'trainee')),
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(training_record_id, user_id, role)
);

ALTER TABLE public.training_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training signatures" ON public.training_signatures
  FOR SELECT TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Insert own training signature" ON public.training_signatures
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())));

-- Attachments
CREATE TABLE public.training_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_record_id uuid NOT NULL REFERENCES public.training_records(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'documents',
  object_path text NOT NULL,
  file_name text,
  file_type text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training attachments" ON public.training_record_attachments
  FOR SELECT TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Manage training attachments" ON public.training_record_attachments
  FOR ALL TO authenticated
  USING (training_record_id IN (SELECT id FROM public.training_records WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_training_records_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
