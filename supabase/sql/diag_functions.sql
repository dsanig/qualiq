-- Diagnóstico de RPC create_new_document_version en schema cache/PostgREST.

-- 1) Funciones en schema public cuyo nombre contiene create_new_document_version
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.oid::regprocedure AS signature,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_arguments(p.oid) AS full_args,
  pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname ILIKE '%create_new_document_version%'
ORDER BY p.proname, identity_args;

-- 2) Vista de information_schema para validar routine publicada
SELECT
  routine_schema,
  routine_name,
  specific_name,
  data_type,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'create_new_document_version'
ORDER BY specific_name;

-- 3) Parámetros exactos (orden, nombre y tipo)
SELECT
  specific_schema,
  specific_name,
  ordinal_position,
  parameter_name,
  data_type,
  udt_name,
  parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name IN (
    SELECT specific_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'create_new_document_version'
  )
ORDER BY specific_name, ordinal_position;

-- 4) Privilegios EXECUTE de cada overload
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.oid::regprocedure AS signature,
  COALESCE(string_agg(priv.grantee || ':' || priv.privilege_type, ', ' ORDER BY priv.grantee), 'NO_GRANTS') AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN information_schema.role_routine_grants priv
  ON priv.routine_schema = n.nspname
 AND priv.routine_name = p.proname
WHERE n.nspname = 'public'
  AND p.proname = 'create_new_document_version'
GROUP BY n.nspname, p.proname, p.oid
ORDER BY signature;
