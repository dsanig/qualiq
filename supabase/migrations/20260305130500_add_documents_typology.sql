ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS typology text NOT NULL DEFAULT 'Documento';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_typology_check'
  ) THEN
    ALTER TABLE public.documents
    ADD CONSTRAINT documents_typology_check
    CHECK (typology IN ('Proceso','PNT','Documento','Normativa','Otro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_typology
ON public.documents(typology);
