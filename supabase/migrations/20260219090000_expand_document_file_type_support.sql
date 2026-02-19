-- Allow modern Office file extensions in document metadata while preserving legacy values.
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_file_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'doc', 'xls', 'word', 'excel'));
