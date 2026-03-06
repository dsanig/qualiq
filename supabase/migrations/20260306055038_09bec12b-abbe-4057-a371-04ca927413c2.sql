ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS typology text NOT NULL DEFAULT 'Documento';

-- Add a validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_document_typology()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.typology NOT IN ('Proceso', 'PNT', 'Documento', 'Normativa', 'Otro') THEN
    RAISE EXCEPTION 'Invalid typology value: %', NEW.typology;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_document_typology ON public.documents;
CREATE TRIGGER trg_validate_document_typology
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_document_typology();