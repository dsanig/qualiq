-- Disable transitions into archived status while preserving existing archived rows.
-- Existing archived documents remain queryable and editable, but no new archive operation is allowed.

CREATE OR REPLACE FUNCTION public.prevent_document_archiving_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'archived'::public.document_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'ARCHIVE_DISABLED'
      USING ERRCODE = 'P0001',
            HINT = 'La funcionalidad de archivar documentos está deshabilitada.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_document_archiving_transition_trigger ON public.documents;

CREATE TRIGGER prevent_document_archiving_transition_trigger
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.prevent_document_archiving_transition();
