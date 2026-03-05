-- Add typology classification for documents module.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'document_typology'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.document_typology AS ENUM ('proceso', 'pnt', 'documento', 'normativa', 'otro');
  END IF;
END
$$;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS typology public.document_typology NOT NULL DEFAULT 'documento';

-- Conservative backfill based on explicit code/title patterns.
UPDATE public.documents
SET typology = 'pnt'
WHERE typology = 'documento'
  AND upper(code) LIKE 'PNT-%';

UPDATE public.documents
SET typology = 'proceso'
WHERE typology = 'documento'
  AND title ILIKE '%proceso%';
