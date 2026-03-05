-- Compatibility overload for PostgREST schema cache lookups expecting
-- (_change_summary, _document_id, _file_path, _responsibilities) argument order.
CREATE OR REPLACE FUNCTION public.create_new_document_version(
  _change_summary text,
  _document_id uuid,
  _file_path text,
  _responsibilities jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_new_document_version(
    _document_id => _document_id,
    _file_path => _file_path,
    _change_summary => _change_summary,
    _responsibilities => _responsibilities
  );
$$;

REVOKE ALL ON FUNCTION public.create_new_document_version(text, uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_new_document_version(text, uuid, text, jsonb) TO authenticated;
