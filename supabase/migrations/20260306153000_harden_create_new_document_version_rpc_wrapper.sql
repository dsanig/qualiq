-- Hardening migration: guarantees the 3-argument RPC signature used by legacy/frontend
-- clients is available in public schema and executable.

CREATE OR REPLACE FUNCTION public.create_new_document_version(
  _document_id uuid,
  _file_path text,
  _responsibilities jsonb
)
RETURNS TABLE(new_version integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.create_new_document_version(
    _document_id => _document_id,
    _file_path => _file_path,
    _change_summary => NULL,
    _responsibilities => COALESCE(_responsibilities, '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.create_new_document_version(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_new_document_version(uuid, text, jsonb) TO authenticated;

-- Keep canonical 4-arg overload executable for current UI.
REVOKE ALL ON FUNCTION public.create_new_document_version(uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_new_document_version(uuid, text, text, jsonb) TO authenticated;
