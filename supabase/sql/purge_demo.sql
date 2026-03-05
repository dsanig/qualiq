-- Safe purge of demo/mock/fictitious data.
-- Run manually in Supabase SQL editor after reviewing the PREVIEW counts.

BEGIN;

-- 1) Build deterministic demo candidates (conservative rules).
WITH demo_companies AS (
  SELECT id
  FROM public.companies
  WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
),
demo_profiles AS (
  SELECT id, user_id, company_id
  FROM public.profiles
  WHERE lower(COALESCE(email, '')) SIMILAR TO '%(demo|test|sample|dummy)%@%'
     OR lower(COALESCE(full_name, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
     OR company_id IN (SELECT id FROM demo_companies)
),
demo_documents AS (
  SELECT id
  FROM public.documents
  WHERE lower(COALESCE(code, '')) LIKE 'demo-%'
     OR lower(COALESCE(code, '')) LIKE 'test-%'
     OR lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
     OR company_id IN (SELECT id FROM demo_companies)
),
demo_incidents AS (
  SELECT id
  FROM public.incidencias
  WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
     OR lower(COALESCE(incidencia_type, '')) LIKE 'demo%'
     OR company_id IN (SELECT id FROM demo_companies)
),
demo_actions AS (
  SELECT id
  FROM public.actions
  WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
     OR company_id IN (SELECT id FROM demo_companies)
)
SELECT 'preview_companies' AS scope, COUNT(*)::bigint AS rows FROM demo_companies
UNION ALL
SELECT 'preview_profiles', COUNT(*)::bigint FROM demo_profiles
UNION ALL
SELECT 'preview_documents', COUNT(*)::bigint FROM demo_documents
UNION ALL
SELECT 'preview_incidencias', COUNT(*)::bigint FROM demo_incidents
UNION ALL
SELECT 'preview_actions', COUNT(*)::bigint FROM demo_actions;

-- 2) Purge dependent records first (FK-safe, all DELETEs are conditional).
DELETE FROM public.predictive_insights
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
);

DELETE FROM public.pattern_detections
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
);

DELETE FROM public.training_answers
WHERE session_id IN (
  SELECT id FROM public.training_sessions
  WHERE user_id IN (
    SELECT user_id
    FROM public.profiles
    WHERE lower(COALESCE(email, '')) SIMILAR TO '%(demo|test|sample|dummy)%@%'
  )
);

DELETE FROM public.training_questions
WHERE session_id IN (
  SELECT id FROM public.training_sessions
  WHERE user_id IN (
    SELECT user_id
    FROM public.profiles
    WHERE lower(COALESCE(email, '')) SIMILAR TO '%(demo|test|sample|dummy)%@%'
  )
);

DELETE FROM public.training_sessions
WHERE user_id IN (
  SELECT user_id
  FROM public.profiles
  WHERE lower(COALESCE(email, '')) SIMILAR TO '%(demo|test|sample|dummy)%@%'
);

DELETE FROM public.document_responsibilities
WHERE document_id IN (
  SELECT id FROM public.documents
  WHERE lower(COALESCE(code, '')) LIKE 'demo-%'
     OR lower(COALESCE(code, '')) LIKE 'test-%'
     OR lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
);

DELETE FROM public.document_versions
WHERE document_id IN (
  SELECT id FROM public.documents
  WHERE lower(COALESCE(code, '')) LIKE 'demo-%'
     OR lower(COALESCE(code, '')) LIKE 'test-%'
     OR lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
);

DELETE FROM public.documents
WHERE lower(COALESCE(code, '')) LIKE 'demo-%'
   OR lower(COALESCE(code, '')) LIKE 'test-%'
   OR lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   OR company_id IN (
     SELECT id FROM public.companies
     WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   );

DELETE FROM public.actions
WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   OR company_id IN (
     SELECT id FROM public.companies
     WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   );

DELETE FROM public.incidencias
WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   OR lower(COALESCE(incidencia_type, '')) LIKE 'demo%'
   OR company_id IN (
     SELECT id FROM public.companies
     WHERE lower(name) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   );

-- 3) Post-check counts.
SELECT 'post_documents_demo_pattern' AS scope, COUNT(*)::bigint AS rows
FROM public.documents
WHERE lower(COALESCE(code, '')) LIKE 'demo-%'
   OR lower(COALESCE(code, '')) LIKE 'test-%'
   OR lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
UNION ALL
SELECT 'post_incidencias_demo_pattern', COUNT(*)::bigint
FROM public.incidencias
WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%'
   OR lower(COALESCE(incidencia_type, '')) LIKE 'demo%'
UNION ALL
SELECT 'post_actions_demo_pattern', COUNT(*)::bigint
FROM public.actions
WHERE lower(COALESCE(title, '')) SIMILAR TO '%(demo|test|sample|dummy|ejemplo|prueba)%';

COMMIT;

-- STORAGE CLEANUP (manual):
-- 1) List candidates (prefix-based):
--    SELECT name FROM storage.objects WHERE bucket_id IN ('documents', 'avatars')
--      AND (name ILIKE 'demo/%' OR name ILIKE 'test/%' OR name ILIKE 'sample/%');
-- 2) Delete confirmed objects:
--    DELETE FROM storage.objects
--    WHERE bucket_id IN ('documents', 'avatars')
--      AND (name ILIKE 'demo/%' OR name ILIKE 'test/%' OR name ILIKE 'sample/%');
