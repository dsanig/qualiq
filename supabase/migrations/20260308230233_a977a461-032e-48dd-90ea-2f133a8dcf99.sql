
DROP VIEW IF EXISTS public.user_directory;

CREATE VIEW public.user_directory AS
SELECT DISTINCT ON (p.user_id)
    p.user_id AS id,
    p.email,
    p.full_name,
    p.company_id,
    COALESCE((ur.role)::text, 'Espectador'::text) AS role,
    p.is_superadmin,
    p.created_at
FROM profiles p
LEFT JOIN user_roles ur ON (ur.user_id = p.user_id)
ORDER BY p.user_id, ur.created_at DESC;
