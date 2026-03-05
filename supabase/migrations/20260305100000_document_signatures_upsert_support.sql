-- Ensure one signature record per (document, user) and allow updates for upsert flows.

WITH dedup AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY document_id, signed_by ORDER BY signed_at DESC, created_at DESC, id DESC) AS rn
  FROM public.document_signatures
)
DELETE FROM public.document_signatures ds
USING dedup
WHERE ds.id = dedup.id
  AND dedup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_document_user_unique_idx
  ON public.document_signatures (document_id, signed_by);

CREATE INDEX IF NOT EXISTS document_signatures_document_id_idx
  ON public.document_signatures (document_id);

DROP POLICY IF EXISTS "Users can update their own signatures" ON public.document_signatures;
CREATE POLICY "Users can update their own signatures"
ON public.document_signatures
FOR UPDATE
USING (
  signed_by = auth.uid()
  AND document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  signed_by = auth.uid()
  AND document_id IN (
    SELECT id FROM public.documents
    WHERE company_id = get_user_company_id(auth.uid())
  )
);
