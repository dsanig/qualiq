-- Ensure RPC compatibility for clients that still call the 3-argument payload
-- while keeping the canonical 4-argument contract used by the current UI.
CREATE OR REPLACE FUNCTION public.create_new_document_version(
  _document_id uuid,
  _file_path text,
  _responsibilities jsonb DEFAULT '[]'::jsonb
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
    _responsibilities => _responsibilities
  );
$$;

REVOKE ALL ON FUNCTION public.create_new_document_version(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_new_document_version(uuid, text, jsonb) TO authenticated;
