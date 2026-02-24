-- Fix RPC parameter-name mismatch for has_role in PostgREST.
-- Canonical RPC signature: public.has_role(_role text, _user_id uuid)
-- Keep a compatibility overload for existing SQL callers that pass (uid uuid, r text).

CREATE OR REPLACE FUNCTION public.has_role(_role text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(uid uuid, r text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(r, uid);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin(uid)
     OR public.has_role('Administrador', uid);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_content(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin(uid)
     OR public.has_role('Administrador', uid)
     OR public.has_role('Editor', uid);
$$;

REVOKE ALL ON FUNCTION public.has_role(text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;

-- Operator verification:
-- select proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and proname='has_role'
-- order by args;
--
-- select proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and proname='is_superadmin'
-- order by args;
