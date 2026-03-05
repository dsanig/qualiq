-- Atomic RPC for creating a new document version while carrying editable responsibilities.
CREATE OR REPLACE FUNCTION public.create_new_document_version(
  _document_id uuid,
  _file_path text,
  _change_summary text DEFAULT NULL,
  _responsibilities jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(new_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_company_id uuid;
  doc_company_id uuid;
  current_version integer;
  next_version integer;
  responsibility_item jsonb;
  target_user_id uuid;
  target_action_type text;
  target_due_date date;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  actor_company_id := public.get_user_company_id(actor_id);
  IF actor_company_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la compañía del usuario.' USING ERRCODE = '42501';
  END IF;

  SELECT d.company_id, d.version
  INTO doc_company_id, current_version
  FROM public.documents d
  WHERE d.id = _document_id;

  IF doc_company_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF doc_company_id <> actor_company_id THEN
    RAISE EXCEPTION 'No tienes acceso a este documento.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.can_edit_content(actor_id) OR public.is_superadmin(actor_id)) THEN
    RAISE EXCEPTION 'No tienes permisos para crear una nueva versión.' USING ERRCODE = '42501';
  END IF;

  IF _file_path IS NULL OR btrim(_file_path) = '' THEN
    RAISE EXCEPTION 'Debes indicar el archivo de la nueva versión.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(_responsibilities) <> 'array' THEN
    RAISE EXCEPTION 'El parámetro responsibilities debe ser un array JSON.' USING ERRCODE = '22023';
  END IF;

  next_version := COALESCE(current_version, 0) + 1;

  INSERT INTO public.document_versions (
    document_id,
    version,
    file_url,
    changes_description,
    created_by
  )
  SELECT
    d.id,
    d.version,
    d.file_url,
    NULLIF(btrim(_change_summary), ''),
    actor_id
  FROM public.documents d
  WHERE d.id = _document_id;

  UPDATE public.documents
  SET
    version = next_version,
    file_url = _file_path,
    status = 'draft',
    updated_at = now()
  WHERE id = _document_id;

  DELETE FROM public.document_responsibilities
  WHERE document_id = _document_id;

  FOR responsibility_item IN SELECT * FROM jsonb_array_elements(_responsibilities)
  LOOP
    target_user_id := NULLIF(responsibility_item->>'responsible_user_id', '')::uuid;
    target_action_type := lower(NULLIF(btrim(responsibility_item->>'action_type'), ''));
    target_due_date := NULLIF(responsibility_item->>'due_date', '')::date;

    IF target_user_id IS NULL OR target_action_type IS NULL OR target_due_date IS NULL THEN
      RAISE EXCEPTION 'Cada responsable debe incluir responsible_user_id, action_type y due_date.' USING ERRCODE = '23514';
    END IF;

    IF target_action_type NOT IN ('firma', 'revision', 'aprobacion') THEN
      RAISE EXCEPTION 'action_type inválido: %', target_action_type USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = target_user_id
        AND p.company_id = actor_company_id
    ) THEN
      RAISE EXCEPTION 'El usuario % no pertenece a tu compañía.', target_user_id USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.document_responsibilities (
      document_id,
      user_id,
      action_type,
      due_date,
      created_by,
      status,
      completed_at
    )
    VALUES (
      _document_id,
      target_user_id,
      target_action_type,
      target_due_date,
      actor_id,
      'pending',
      NULL
    );
  END LOOP;

  RETURN QUERY SELECT next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.create_new_document_version(uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_new_document_version(uuid, text, text, jsonb) TO authenticated;

