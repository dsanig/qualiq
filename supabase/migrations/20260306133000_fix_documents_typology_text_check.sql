-- Ensure documents.typology exists as text and matches UI values.
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS typology text NOT NULL DEFAULT 'Documento';

DO $$
BEGIN
  -- Normalize legacy lowercase values before enforcing the check.
  UPDATE public.documents
  SET typology = CASE lower(typology)
    WHEN 'proceso' THEN 'Proceso'
    WHEN 'pnt' THEN 'PNT'
    WHEN 'documento' THEN 'Documento'
    WHEN 'normativa' THEN 'Normativa'
    WHEN 'otro' THEN 'Otro'
    ELSE COALESCE(NULLIF(typology, ''), 'Documento')
  END;

  -- If typology was created with enum type, convert it to text.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'typology'
      AND udt_name = 'document_typology'
  ) THEN
    ALTER TABLE public.documents
      ALTER COLUMN typology TYPE text USING typology::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_typology_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
    ADD CONSTRAINT documents_typology_check
    CHECK (typology IN ('Proceso','PNT','Documento','Normativa','Otro'));
  END IF;
END $$;
