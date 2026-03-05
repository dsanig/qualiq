-- QMS/DMS ISO foundation: version-centric workflow, signatures, responsibilities and immutable audit log.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_version_status') THEN
    CREATE TYPE public.document_version_status AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADO', 'OBSOLETO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_action_type') THEN
    CREATE TYPE public.document_action_type AS ENUM ('REVISION', 'APROBACION', 'FIRMA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_responsibility_state') THEN
    CREATE TYPE public.document_responsibility_state AS ENUM ('PENDIENTE', 'COMPLETADO', 'CANCELADO');
  END IF;
END
$$;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS status_master text NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS status public.document_version_status NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS file_object_path text,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS change_summary text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS obsoleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS obsoleted_by uuid,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

UPDATE public.document_versions
SET version_label = COALESCE(version_label, 'v' || version::text || '.0'),
    change_summary = COALESCE(change_summary, changes_description),
    file_object_path = COALESCE(file_object_path, file_url);

-- Ensure every document has a current document_version row.
INSERT INTO public.document_versions (
  document_id,
  version,
  version_label,
  file_url,
  file_object_path,
  changes_description,
  change_summary,
  created_by,
  status,
  locked,
  checksum
)
SELECT
  d.id,
  d.version,
  'v' || d.version::text || '.0',
  d.file_url,
  d.file_url,
  'Migración inicial a control por versión',
  'Migración inicial a control por versión',
  d.owner_id,
  CASE d.status
    WHEN 'approved' THEN 'APROBADO'::public.document_version_status
    WHEN 'review' THEN 'EN_REVISION'::public.document_version_status
    WHEN 'obsolete' THEN 'OBSOLETO'::public.document_version_status
    ELSE 'BORRADOR'::public.document_version_status
  END,
  d.is_locked,
  NULL
FROM public.documents d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.document_versions dv
  WHERE dv.document_id = d.id
    AND dv.version = d.version
);

-- Set current_version_id to best matching row.
UPDATE public.documents d
SET current_version_id = dv.id,
    created_by = COALESCE(d.created_by, d.owner_id),
    updated_by = COALESCE(d.updated_by, d.owner_id)
FROM LATERAL (
  SELECT id
  FROM public.document_versions
  WHERE document_id = d.id
  ORDER BY (version = d.version) DESC, version DESC, created_at DESC
  LIMIT 1
) dv
WHERE d.current_version_id IS NULL;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_current_version_id_fkey,
  ADD CONSTRAINT documents_current_version_id_fkey
    FOREIGN KEY (current_version_id)
    REFERENCES public.document_versions (id);

CREATE INDEX IF NOT EXISTS idx_documents_current_version_id ON public.documents(current_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_document_version ON public.document_versions(document_id, version);

ALTER TABLE public.document_responsibilities
  ADD COLUMN IF NOT EXISTS version_id uuid,
  ADD COLUMN IF NOT EXISTS state public.document_responsibility_state NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS completed_by uuid;

UPDATE public.document_responsibilities dr
SET version_id = d.current_version_id,
    state = CASE
      WHEN dr.status = 'completed' THEN 'COMPLETADO'::public.document_responsibility_state
      ELSE 'PENDIENTE'::public.document_responsibility_state
    END
FROM public.documents d
WHERE dr.document_id = d.id
  AND dr.version_id IS NULL;

ALTER TABLE public.document_responsibilities
  ALTER COLUMN version_id SET NOT NULL;

ALTER TABLE public.document_responsibilities
  DROP CONSTRAINT IF EXISTS document_responsibilities_version_id_fkey,
  ADD CONSTRAINT document_responsibilities_version_id_fkey
    FOREIGN KEY (version_id)
    REFERENCES public.document_versions(id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_responsibility_version_action_user
  ON public.document_responsibilities (version_id, action_type, user_id);

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS version_id uuid,
  ADD COLUMN IF NOT EXISTS signature_type public.document_action_type,
  ADD COLUMN IF NOT EXISTS signature_payload jsonb,
  ADD COLUMN IF NOT EXISTS evidence_hash text,
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

UPDATE public.document_signatures ds
SET version_id = d.current_version_id,
    signature_type = COALESCE(ds.signature_type, 'FIRMA'::public.document_action_type)
FROM public.documents d
WHERE ds.document_id = d.id
  AND ds.version_id IS NULL;

ALTER TABLE public.document_signatures
  ALTER COLUMN version_id SET NOT NULL,
  ALTER COLUMN signature_type SET NOT NULL;

ALTER TABLE public.document_signatures
  DROP CONSTRAINT IF EXISTS document_signatures_version_id_fkey,
  ADD CONSTRAINT document_signatures_version_id_fkey
    FOREIGN KEY (version_id)
    REFERENCES public.document_versions(id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_signature_version_user_type
  ON public.document_signatures(version_id, signed_by, signature_type);

CREATE TABLE IF NOT EXISTS public.document_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  actor_role_snapshot text,
  at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View document audit log" ON public.document_audit_log;
CREATE POLICY "View document audit log"
ON public.document_audit_log
FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR public.is_superadmin(auth.uid())
);

DROP POLICY IF EXISTS "Insert document audit log" ON public.document_audit_log;
CREATE POLICY "Insert document audit log"
ON public.document_audit_log
FOR INSERT
WITH CHECK (
  actor_user_id = auth.uid()
  AND (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_superadmin(auth.uid())
  )
);

DROP POLICY IF EXISTS "No update document audit log" ON public.document_audit_log;
CREATE POLICY "No update document audit log"
ON public.document_audit_log
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "No delete document audit log" ON public.document_audit_log;
CREATE POLICY "No delete document audit log"
ON public.document_audit_log
FOR DELETE
USING (false);

CREATE OR REPLACE FUNCTION public.log_document_audit(
  _company_id uuid,
  _entity_type text,
  _entity_id uuid,
  _action text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid;
BEGIN
  _actor := auth.uid();

  INSERT INTO public.document_audit_log (
    company_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    actor_role_snapshot,
    details
  ) VALUES (
    _company_id,
    _entity_type,
    _entity_id,
    _action,
    _actor,
    COALESCE((SELECT role::text FROM public.user_roles WHERE user_id = _actor ORDER BY created_at DESC LIMIT 1), 'unknown'),
    COALESCE(_details, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_responsibility(
  _version_id uuid,
  _action_type text,
  _responsible_user_id uuid,
  _due_date date,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _document_id uuid;
  _company_id uuid;
  _id uuid;
BEGIN
  SELECT dv.document_id, d.company_id
  INTO _document_id, _company_id
  FROM public.document_versions dv
  JOIN public.documents d ON d.id = dv.document_id
  WHERE dv.id = _version_id;

  IF _document_id IS NULL THEN
    RAISE EXCEPTION 'Version no encontrada';
  END IF;

  IF NOT (public.can_manage_company(auth.uid()) OR public.is_superadmin(auth.uid()) OR public.can_edit_content(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes';
  END IF;

  INSERT INTO public.document_responsibilities (
    document_id,
    version_id,
    user_id,
    action_type,
    due_date,
    status,
    state,
    notes,
    created_by
  ) VALUES (
    _document_id,
    _version_id,
    _responsible_user_id,
    lower(_action_type),
    _due_date,
    'pending',
    'PENDIENTE',
    _notes,
    auth.uid()
  )
  RETURNING id INTO _id;

  PERFORM public.log_document_audit(_company_id, 'document_responsibilities', _id, 'ASSIGNED', jsonb_build_object('version_id', _version_id, 'action_type', _action_type, 'responsible_user_id', _responsible_user_id));

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_responsibility(_responsibility_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
BEGIN
  IF NOT (public.can_manage_company(auth.uid()) OR public.is_superadmin(auth.uid()) OR public.can_edit_content(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes';
  END IF;

  SELECT d.company_id
  INTO _company_id
  FROM public.document_responsibilities dr
  JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.id = _responsibility_id;

  DELETE FROM public.document_responsibilities
  WHERE id = _responsibility_id;

  PERFORM public.log_document_audit(_company_id, 'document_responsibilities', _responsibility_id, 'UNASSIGNED', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_new_version(
  _document_id uuid,
  _new_version integer,
  _file_path text,
  _change_summary text,
  _responsibilities jsonb DEFAULT '[]'::jsonb,
  _checksum text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _prev_version_id uuid;
  _new_version_id uuid;
  _has_revision boolean;
  _has_approval boolean;
  _item jsonb;
BEGIN
  SELECT company_id, current_version_id
  INTO _company_id, _prev_version_id
  FROM public.documents
  WHERE id = _document_id;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;

  IF NOT (public.can_edit_content(auth.uid()) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes';
  END IF;

  IF COALESCE(trim(_change_summary), '') = '' THEN
    RAISE EXCEPTION 'change_summary es obligatorio';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_versions
    WHERE document_id = _document_id AND version = _new_version
  ) THEN
    RAISE EXCEPTION 'La versión ya existe';
  END IF;

  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(_responsibilities) x WHERE upper(x->>'action_type') = 'REVISION') INTO _has_revision;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(_responsibilities) x WHERE upper(x->>'action_type') = 'APROBACION') INTO _has_approval;

  IF NOT _has_revision OR NOT _has_approval THEN
    RAISE EXCEPTION 'Debes definir al menos un responsable de REVISION y uno de APROBACION';
  END IF;

  IF _prev_version_id IS NOT NULL THEN
    UPDATE public.document_versions
    SET status = 'OBSOLETO', obsoleted_at = now(), obsoleted_by = auth.uid(), locked = true, updated_at = now(), updated_by = auth.uid()
    WHERE id = _prev_version_id;

    UPDATE public.documents
    SET status = 'obsolete'
    WHERE id = _document_id AND status = 'approved';
  END IF;

  INSERT INTO public.document_versions (
    document_id,
    version,
    version_label,
    file_url,
    file_object_path,
    changes_description,
    change_summary,
    created_by,
    updated_by,
    status,
    checksum,
    locked
  ) VALUES (
    _document_id,
    _new_version,
    'v' || _new_version::text || '.0',
    _file_path,
    _file_path,
    _change_summary,
    _change_summary,
    auth.uid(),
    auth.uid(),
    'BORRADOR',
    _checksum,
    false
  ) RETURNING id INTO _new_version_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_responsibilities)
  LOOP
    PERFORM public.assign_responsibility(
      _new_version_id,
      upper(_item->>'action_type'),
      (_item->>'responsible_user_id')::uuid,
      (_item->>'due_date')::date,
      _item->>'notes'
    );
  END LOOP;

  UPDATE public.documents
  SET current_version_id = _new_version_id,
      version = _new_version,
      file_url = _file_path,
      status = 'draft',
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = _document_id;

  PERFORM public.log_document_audit(_company_id, 'document_versions', _new_version_id, 'CREATED', jsonb_build_object('document_id', _document_id, 'version', _new_version, 'change_summary', _change_summary));

  RETURN _new_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_version_status(
  _version_id uuid,
  _new_status public.document_version_status,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc_id uuid;
  _company_id uuid;
  _current_status public.document_version_status;
  _required_pending integer;
BEGIN
  SELECT dv.document_id, d.company_id, dv.status
  INTO _doc_id, _company_id, _current_status
  FROM public.document_versions dv
  JOIN public.documents d ON d.id = dv.document_id
  WHERE dv.id = _version_id;

  IF _doc_id IS NULL THEN
    RAISE EXCEPTION 'Versión no encontrada';
  END IF;

  IF _current_status = _new_status THEN
    RETURN;
  END IF;

  IF _current_status = 'OBSOLETO' THEN
    RAISE EXCEPTION 'No se puede cambiar estado de una versión obsoleta';
  END IF;

  IF _current_status = 'BORRADOR' AND _new_status NOT IN ('EN_REVISION') THEN
    RAISE EXCEPTION 'Transición no permitida';
  END IF;

  IF _current_status = 'EN_REVISION' AND _new_status NOT IN ('BORRADOR', 'APROBADO') THEN
    RAISE EXCEPTION 'Transición no permitida';
  END IF;

  IF _current_status = 'APROBADO' AND _new_status <> 'OBSOLETO' THEN
    RAISE EXCEPTION 'Transición no permitida';
  END IF;

  IF _new_status = 'EN_REVISION' THEN
    IF NOT EXISTS (SELECT 1 FROM public.document_responsibilities WHERE version_id = _version_id) THEN
      RAISE EXCEPTION 'Debes asignar responsables antes de enviar a revisión';
    END IF;
  END IF;

  IF _new_status = 'APROBADO' THEN
    SELECT count(*)
    INTO _required_pending
    FROM public.document_responsibilities
    WHERE version_id = _version_id
      AND state = 'PENDIENTE'
      AND lower(action_type) IN ('revision', 'aprobacion', 'firma');

    IF _required_pending > 0 THEN
      RAISE EXCEPTION 'No se puede aprobar: hay responsabilidades pendientes';
    END IF;
  END IF;

  UPDATE public.document_versions
  SET status = _new_status,
      locked = _new_status IN ('EN_REVISION', 'APROBADO', 'OBSOLETO'),
      updated_at = now(),
      updated_by = auth.uid(),
      obsoleted_at = CASE WHEN _new_status = 'OBSOLETO' THEN now() ELSE obsoleted_at END,
      obsoleted_by = CASE WHEN _new_status = 'OBSOLETO' THEN auth.uid() ELSE obsoleted_by END
  WHERE id = _version_id;

  UPDATE public.documents
  SET status = CASE _new_status
                 WHEN 'BORRADOR' THEN 'draft'::public.document_status
                 WHEN 'EN_REVISION' THEN 'review'::public.document_status
                 WHEN 'APROBADO' THEN 'approved'::public.document_status
                 WHEN 'OBSOLETO' THEN 'obsolete'::public.document_status
               END,
      is_locked = _new_status IN ('EN_REVISION', 'APROBADO', 'OBSOLETO'),
      locked_at = CASE WHEN _new_status IN ('EN_REVISION', 'APROBADO', 'OBSOLETO') THEN now() ELSE null END,
      locked_by = CASE WHEN _new_status IN ('EN_REVISION', 'APROBADO', 'OBSOLETO') THEN auth.uid() ELSE null END,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _doc_id;

  INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
  VALUES (_doc_id, lower(_current_status::text), lower(_new_status::text), auth.uid(), _reason);

  PERFORM public.log_document_audit(_company_id, 'document_versions', _version_id, 'STATUS_CHANGED', jsonb_build_object('from', _current_status, 'to', _new_status, 'reason', _reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_version(
  _version_id uuid,
  _signature_type text,
  _method text,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc_id uuid;
  _company_id uuid;
  _status public.document_version_status;
  _checksum text;
  _sig_id uuid;
  _action text;
BEGIN
  SELECT dv.document_id, d.company_id, dv.status, dv.checksum
  INTO _doc_id, _company_id, _status, _checksum
  FROM public.document_versions dv
  JOIN public.documents d ON d.id = dv.document_id
  WHERE dv.id = _version_id;

  IF _doc_id IS NULL THEN
    RAISE EXCEPTION 'Versión no encontrada';
  END IF;

  IF _status = 'OBSOLETO' THEN
    RAISE EXCEPTION 'No se puede firmar una versión obsoleta';
  END IF;

  _action := lower(_signature_type);
  IF _action = 'firma' THEN _action := 'firma'; END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.document_responsibilities dr
      WHERE dr.version_id = _version_id
        AND dr.user_id = auth.uid()
        AND lower(dr.action_type) = _action
    )
  ) THEN
    RAISE EXCEPTION 'No tienes responsabilidad asignada para esta firma';
  END IF;

  INSERT INTO public.document_signatures (
    version_id,
    document_id,
    signed_by,
    signer_name,
    signer_email,
    signature_method,
    signature_data,
    signature_payload,
    signature_type,
    evidence_hash,
    signed_at
  ) VALUES (
    _version_id,
    _doc_id,
    auth.uid(),
    _payload->>'signer_name',
    _payload->>'signer_email',
    _method,
    _payload->>'reason',
    _payload,
    upper(_signature_type)::public.document_action_type,
    _checksum,
    now()
  )
  ON CONFLICT (version_id, signed_by, signature_type)
  DO UPDATE SET
    signature_method = EXCLUDED.signature_method,
    signature_data = EXCLUDED.signature_data,
    signature_payload = EXCLUDED.signature_payload,
    evidence_hash = EXCLUDED.evidence_hash,
    signed_at = EXCLUDED.signed_at
  RETURNING id INTO _sig_id;

  UPDATE public.document_responsibilities
  SET status = 'completed',
      state = 'COMPLETADO',
      completed_at = now(),
      completed_by = auth.uid()
  WHERE version_id = _version_id
    AND user_id = auth.uid()
    AND lower(action_type) = _action;

  PERFORM public.log_document_audit(_company_id, 'document_signatures', _sig_id, 'SIGNED', jsonb_build_object('version_id', _version_id, 'signature_type', _signature_type, 'method', _method));

  RETURN _sig_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_version_signature_status(
  _version_id uuid,
  _scope text DEFAULT 'responsibles_only'
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  action_type text,
  responsibility_state text,
  is_signed boolean,
  signed_at timestamptz,
  signature_method text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base_users AS (
    SELECT p.user_id, p.full_name, p.email
    FROM public.profiles p
    WHERE (
      _scope = 'all_company_users'
      AND p.company_id = public.get_user_company_id(auth.uid())
    )
    OR (
      _scope <> 'all_company_users'
      AND EXISTS (
        SELECT 1 FROM public.document_responsibilities dr
        WHERE dr.version_id = _version_id
          AND dr.user_id = p.user_id
      )
    )
  )
  SELECT
    bu.user_id,
    bu.full_name,
    bu.email,
    dr.action_type,
    dr.state::text,
    (ds.id IS NOT NULL) AS is_signed,
    ds.signed_at,
    ds.signature_method
  FROM base_users bu
  LEFT JOIN public.document_responsibilities dr
    ON dr.version_id = _version_id
   AND dr.user_id = bu.user_id
  LEFT JOIN LATERAL (
    SELECT id, signed_at, signature_method
    FROM public.document_signatures ds
    WHERE ds.version_id = _version_id
      AND ds.signed_by = bu.user_id
    ORDER BY ds.signed_at DESC
    LIMIT 1
  ) ds ON true
  ORDER BY bu.full_name NULLS LAST, bu.email;
$$;

REVOKE ALL ON FUNCTION public.create_new_version(uuid, integer, text, text, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.set_version_status(uuid, public.document_version_status, text) FROM public;
REVOKE ALL ON FUNCTION public.sign_version(uuid, text, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.assign_responsibility(uuid, text, uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.unassign_responsibility(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_version_signature_status(uuid, text) FROM public;

GRANT EXECUTE ON FUNCTION public.create_new_version(uuid, integer, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_version_status(uuid, public.document_version_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_version(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_responsibility(uuid, text, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_responsibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_version_signature_status(uuid, text) TO authenticated;
