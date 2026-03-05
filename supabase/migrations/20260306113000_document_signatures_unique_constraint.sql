-- Align document_signatures UPSERT conflict target with an explicit unique constraint.
-- This prevents ON CONFLICT errors when signing and preserves one signature per (document, signer).

WITH ranked_signatures AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY document_id, signed_by
      ORDER BY signed_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.document_signatures
)
DELETE FROM public.document_signatures ds
USING ranked_signatures rs
WHERE ds.id = rs.id
  AND rs.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_document_user_unique_idx
  ON public.document_signatures (document_id, signed_by);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_signatures_document_user_unique'
      AND conrelid = 'public.document_signatures'::regclass
  ) THEN
    ALTER TABLE public.document_signatures
      ADD CONSTRAINT document_signatures_document_user_unique
      UNIQUE USING INDEX document_signatures_document_user_unique_idx;
  END IF;
END;
$$;
