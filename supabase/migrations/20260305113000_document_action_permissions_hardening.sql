-- Harden document action execution permissions by responsibility assignment.

CREATE OR REPLACE FUNCTION public.can_perform_document_action(
  _user_id uuid,
  _document_id uuid,
  _action_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.document_responsibilities dr
      JOIN public.documents d ON d.id = dr.document_id
      WHERE dr.document_id = _document_id
        AND dr.user_id = _user_id
        AND dr.action_type = _action_type
        AND d.company_id = public.get_user_company_id(_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_perform_document_action(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_perform_document_action(uuid, uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Update document responsibilities" ON public.document_responsibilities;
CREATE POLICY "Update own document responsibilities"
ON public.document_responsibilities
FOR UPDATE
USING (
  document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND (
    public.is_superadmin(auth.uid())
    OR user_id = auth.uid()
  )
)
WITH CHECK (
  document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND (
    public.is_superadmin(auth.uid())
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.document_signatures;
CREATE POLICY "Users can insert assigned signatures"
ON public.document_signatures
FOR INSERT
WITH CHECK (
  signed_by = auth.uid()
  AND document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND public.can_perform_document_action(auth.uid(), document_id, 'firma')
);

DROP POLICY IF EXISTS "Users can update their own signatures" ON public.document_signatures;
CREATE POLICY "Users can update assigned signatures"
ON public.document_signatures
FOR UPDATE
USING (
  signed_by = auth.uid()
  AND document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND public.can_perform_document_action(auth.uid(), document_id, 'firma')
)
WITH CHECK (
  signed_by = auth.uid()
  AND document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND public.can_perform_document_action(auth.uid(), document_id, 'firma')
);

DROP POLICY IF EXISTS "Insert status changes" ON public.document_status_changes;
CREATE POLICY "Insert status changes"
ON public.document_status_changes
FOR INSERT
WITH CHECK (
  document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
  AND (
    public.is_superadmin(auth.uid())
    OR (
      new_status = 'review'
      AND public.can_perform_document_action(auth.uid(), document_id, 'revision')
    )
    OR (
      new_status = 'approved'
      AND public.can_perform_document_action(auth.uid(), document_id, 'aprobacion')
    )
    OR new_status = 'draft'
  )
);

CREATE OR REPLACE FUNCTION public.enforce_document_action_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    target_action := CASE NEW.status
      WHEN 'review' THEN 'revision'
      WHEN 'approved' THEN 'aprobacion'
      ELSE NULL
    END;

    IF target_action IS NOT NULL
      AND NOT public.can_perform_document_action(auth.uid(), NEW.id, target_action) THEN
      RAISE EXCEPTION 'No tienes permisos para completar la acción % de este documento.', target_action
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_enforce_action_permissions ON public.documents;
CREATE TRIGGER documents_enforce_action_permissions
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_action_permissions();
