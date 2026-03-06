-- Junction table for many-to-many: incidencias <-> capa_plans
CREATE TABLE public.incidencia_capa_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidencia_id uuid NOT NULL REFERENCES public.incidencias(id) ON DELETE CASCADE,
  capa_plan_id uuid NOT NULL REFERENCES public.capa_plans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (incidencia_id, capa_plan_id)
);

ALTER TABLE public.incidencia_capa_plans ENABLE ROW LEVEL SECURITY;

-- View: users can see links in their company
CREATE POLICY "View incidencia_capa_plans"
ON public.incidencia_capa_plans
FOR SELECT
TO authenticated
USING (
  incidencia_id IN (
    SELECT id FROM public.incidencias WHERE company_id = get_user_company_id(auth.uid())
  )
);

-- Insert: editors can create links
CREATE POLICY "Insert incidencia_capa_plans"
ON public.incidencia_capa_plans
FOR INSERT
TO authenticated
WITH CHECK (
  incidencia_id IN (
    SELECT id FROM public.incidencias WHERE company_id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);

-- Delete: editors can remove links
CREATE POLICY "Delete incidencia_capa_plans"
ON public.incidencia_capa_plans
FOR DELETE
TO authenticated
USING (
  incidencia_id IN (
    SELECT id FROM public.incidencias WHERE company_id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);