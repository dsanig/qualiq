-- Unified attachments for non-conformities and actions with tenant-safe controls.

DO $$ BEGIN
  CREATE TYPE public.qms_attachment_entity AS ENUM ('non_conformity', 'action');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.qms_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type public.qms_attachment_entity NOT NULL,
  entity_id uuid NOT NULL,
  bucket_id text NOT NULL DEFAULT 'documents',
  object_path text NOT NULL UNIQUE,
  file_name text,
  mime_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qms_attachments_file_size_non_negative CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_qms_attachments_entity ON public.qms_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qms_attachments_company ON public.qms_attachments(company_id);

ALTER TABLE public.qms_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.qms_attachment_limits()
RETURNS TABLE(max_file_size_bytes bigint, max_files_per_record integer)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(NULLIF(current_setting('app.settings.qms_attachment_max_size_bytes', true), '')::bigint, 20 * 1024 * 1024),
    COALESCE(NULLIF(current_setting('app.settings.qms_attachment_max_files_per_record', true), '')::integer, 10);
$$;

CREATE OR REPLACE FUNCTION public.validate_qms_entity_company(
  p_entity_type public.qms_attachment_entity,
  p_entity_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_entity_type = 'non_conformity'::public.qms_attachment_entity THEN EXISTS (
      SELECT 1 FROM public.non_conformities nc WHERE nc.id = p_entity_id AND nc.company_id = p_company_id
    )
    WHEN p_entity_type = 'action'::public.qms_attachment_entity THEN EXISTS (
      SELECT 1 FROM public.actions a WHERE a.id = p_entity_id AND a.company_id = p_company_id
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.register_qms_attachment(
  p_entity_type text,
  p_entity_id uuid,
  p_bucket_id text,
  p_object_path text,
  p_file_name text DEFAULT null
)
RETURNS public.qms_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.get_user_company_id(v_user_id);
  v_entity_type public.qms_attachment_entity;
  v_storage_obj record;
  v_max_size bigint;
  v_max_files integer;
  v_existing integer;
  v_inserted public.qms_attachments;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.can_edit_content(v_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_entity_type := p_entity_type::public.qms_attachment_entity;

  IF v_company_id IS NULL OR NOT public.validate_qms_entity_company(v_entity_type, p_entity_id, v_company_id) THEN
    RAISE EXCEPTION 'Entity not found for tenant';
  END IF;

  SELECT max_file_size_bytes, max_files_per_record INTO v_max_size, v_max_files FROM public.qms_attachment_limits();

  SELECT COUNT(*)::integer INTO v_existing
  FROM public.qms_attachments
  WHERE entity_type = v_entity_type AND entity_id = p_entity_id AND company_id = v_company_id;

  IF v_existing >= v_max_files THEN
    RAISE EXCEPTION 'Attachment limit reached';
  END IF;

  SELECT
    o.metadata,
    COALESCE((o.metadata->>'size')::bigint, 0) AS size,
    COALESCE(o.metadata->>'mimetype', o.metadata->>'contentType') AS mime
  INTO v_storage_obj
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket_id
    AND o.name = p_object_path;

  IF v_storage_obj IS NULL THEN
    RAISE EXCEPTION 'Uploaded object not found';
  END IF;

  IF v_storage_obj.size > v_max_size THEN
    RAISE EXCEPTION 'File exceeds max allowed size';
  END IF;

  INSERT INTO public.qms_attachments (
    company_id, entity_type, entity_id, bucket_id, object_path, file_name, mime_type, file_size, uploaded_by
  ) VALUES (
    v_company_id,
    v_entity_type,
    p_entity_id,
    p_bucket_id,
    p_object_path,
    LEFT(NULLIF(p_file_name, ''), 255),
    v_storage_obj.mime,
    v_storage_obj.size,
    v_user_id
  )
  RETURNING * INTO v_inserted;

  INSERT INTO public.audit_trail (company_id, user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    v_company_id,
    v_user_id,
    'upload_attachment',
    p_entity_type,
    p_entity_id::text,
    LEFT(COALESCE(p_file_name, p_object_path), 120),
    jsonb_build_object('attachment_id', v_inserted.id, 'path', p_object_path)
  );

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_qms_attachment(p_attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.get_user_company_id(v_user_id);
  v_att public.qms_attachments;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_edit_content(v_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_att
  FROM public.qms_attachments
  WHERE id = p_attachment_id
    AND company_id = v_company_id;

  IF v_att.id IS NULL THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;

  DELETE FROM storage.objects WHERE bucket_id = v_att.bucket_id AND name = v_att.object_path;
  DELETE FROM public.qms_attachments WHERE id = p_attachment_id;

  INSERT INTO public.audit_trail (company_id, user_id, action, entity_type, entity_id, entity_title, details)
  VALUES (
    v_company_id,
    v_user_id,
    'delete_attachment',
    v_att.entity_type::text,
    v_att.entity_id::text,
    LEFT(COALESCE(v_att.file_name, v_att.object_path), 120),
    jsonb_build_object('attachment_id', v_att.id, 'path', v_att.object_path)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_qms_attachment(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_qms_attachment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qms_attachment_limits() TO authenticated;

DROP POLICY IF EXISTS qms_attachments_read_same_tenant ON public.qms_attachments;
CREATE POLICY qms_attachments_read_same_tenant
ON public.qms_attachments
FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS qms_attachments_insert_same_tenant ON public.qms_attachments;
CREATE POLICY qms_attachments_insert_same_tenant
ON public.qms_attachments
FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.can_edit_content(auth.uid()));

DROP POLICY IF EXISTS qms_attachments_delete_same_tenant ON public.qms_attachments;
CREATE POLICY qms_attachments_delete_same_tenant
ON public.qms_attachments
FOR DELETE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) AND public.can_edit_content(auth.uid()));

DROP POLICY IF EXISTS storage_qms_docs_insert ON storage.objects;
CREATE POLICY storage_qms_docs_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND split_part(name, '/', 1) = 'qms'
  AND split_part(name, '/', 2) = public.get_user_company_id(auth.uid())::text
  AND public.can_edit_content(auth.uid())
);

DROP POLICY IF EXISTS storage_qms_docs_read ON storage.objects;
CREATE POLICY storage_qms_docs_read
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND split_part(name, '/', 1) = 'qms'
  AND split_part(name, '/', 2) = public.get_user_company_id(auth.uid())::text
);

DROP POLICY IF EXISTS storage_qms_docs_delete ON storage.objects;
CREATE POLICY storage_qms_docs_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND split_part(name, '/', 1) = 'qms'
  AND split_part(name, '/', 2) = public.get_user_company_id(auth.uid())::text
  AND public.can_edit_content(auth.uid())
);
