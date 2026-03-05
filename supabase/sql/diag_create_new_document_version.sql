-- Diagnóstico puntual para verificar resolución RPC de create_new_document_version.

-- A) Buscar todas las funciones con ese nombre en cualquier schema.
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'create_new_document_version'
ORDER BY n.nspname;

-- B) Confirmar si existe específicamente en schema public.
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_new_document_version';
