-- Restrict incidencia deletion to superadmin and add deletion audit trail.

CREATE TABLE IF NOT EXISTS public.incidencia_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL DEFAULT 'delete_incidencia',
  incidencia_id uuid NOT NULL,
  incidencia_title text,
  deleted_by_user_id uuid,
  deleted_by_email text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencia_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View incidencia deletion audit" ON public.incidencia_deletion_audit;
CREATE POLICY "View incidencia deletion audit"
  ON public.incidencia_deletion_audit
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Insert incidencia deletion audit" ON public.incidencia_deletion_audit;
CREATE POLICY "Insert incidencia deletion audit"
  ON public.incidencia_deletion_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Remove broader/legacy policies that could allow delete through can_edit_content/can_manage_qms.
DROP POLICY IF EXISTS incidencias_manage ON public.incidencias;
DROP POLICY IF EXISTS incidencias_admin_full_access ON public.incidencias;
DROP POLICY IF EXISTS "Delete incidencias" ON public.incidencias;
DROP POLICY IF EXISTS "Insert incidencias" ON public.incidencias;
DROP POLICY IF EXISTS "Update incidencias" ON public.incidencias;
DROP POLICY IF EXISTS "View incidencias" ON public.incidencias;
DROP POLICY IF EXISTS incidencias_select ON public.incidencias;
DROP POLICY IF EXISTS incidencias_insert ON public.incidencias;
DROP POLICY IF EXISTS incidencias_update_manage ON public.incidencias;
DROP POLICY IF EXISTS incidencias_delete_superadmin_only ON public.incidencias;

CREATE POLICY incidencias_select
  ON public.incidencias
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY incidencias_insert
  ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_edit_content(auth.uid())
  );

CREATE POLICY incidencias_update_manage
  ON public.incidencias
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_edit_content(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_edit_content(auth.uid())
  );

CREATE POLICY incidencias_delete_superadmin_only
  ON public.incidencias
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_superadmin = true
    )
  );
