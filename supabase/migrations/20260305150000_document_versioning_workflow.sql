-- Formal document versioning workflow: per-version responsibilities, signatures and change summary.

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS change_summary text;

UPDATE public.document_versions
SET change_summary = COALESCE(change_summary, changes_description)
WHERE change_summary IS NULL;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'draft';

UPDATE public.document_versions
SET status = COALESCE(status, 'draft');

-- Ensure each document has an explicit current version row.
INSERT INTO public.document_versions (document_id, version, file_url, changes_description, change_summary, created_by, created_at, status)
SELECT d.id, d.version, d.file_url, 'Versión inicial del documento.', 'Versión inicial del documento.', d.owner_id, d.created_at, d.status
FROM public.documents d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.document_versions dv
  WHERE dv.document_id = d.id
    AND dv.version = d.version
);

-- Mark all non-current historical rows as obsolete and keep current aligned with document status.
UPDATE public.document_versions dv
SET status = CASE
  WHEN dv.version = d.version THEN d.status
  ELSE 'obsolete'::public.document_status
END
FROM public.documents d
WHERE d.id = dv.document_id;

ALTER TABLE public.document_responsibilities
  ADD COLUMN IF NOT EXISTS version_id uuid;

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS version_id uuid;

-- Backfill responsibilities/signatures to current version when missing.
UPDATE public.document_responsibilities dr
SET version_id = dv.id
FROM public.document_versions dv
JOIN public.documents d ON d.id = dv.document_id
WHERE dr.document_id = dv.document_id
  AND dv.version = d.version
  AND dr.version_id IS NULL;

UPDATE public.document_signatures ds
SET version_id = dv.id
FROM public.document_versions dv
JOIN public.documents d ON d.id = dv.document_id
WHERE ds.document_id = dv.document_id
  AND dv.version = d.version
  AND ds.version_id IS NULL;

ALTER TABLE public.document_responsibilities
  ALTER COLUMN version_id SET NOT NULL;

ALTER TABLE public.document_signatures
  ALTER COLUMN version_id SET NOT NULL;

ALTER TABLE public.document_responsibilities
  ADD CONSTRAINT document_responsibilities_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;

ALTER TABLE public.document_signatures
  ADD CONSTRAINT document_signatures_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS document_responsibilities_document_version_idx
  ON public.document_responsibilities (document_id, version_id);

CREATE INDEX IF NOT EXISTS document_signatures_document_version_idx
  ON public.document_signatures (document_id, version_id);

DROP INDEX IF EXISTS public.document_signatures_document_user_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_document_version_user_unique_idx
  ON public.document_signatures (document_id, version_id, signed_by);

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
  WITH current_version AS (
    SELECT dv.id
    FROM public.document_versions dv
    JOIN public.documents d ON d.id = dv.document_id
    WHERE dv.document_id = _document_id
      AND dv.version = d.version
      AND dv.status <> 'obsolete'
    LIMIT 1
  )
  SELECT
    public.is_superadmin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.document_responsibilities dr
      JOIN public.documents d ON d.id = dr.document_id
      JOIN current_version cv ON cv.id = dr.version_id
      WHERE dr.document_id = _document_id
        AND dr.user_id = _user_id
        AND dr.action_type = _action_type
        AND d.company_id = public.get_user_company_id(_user_id)
    );
$$;
