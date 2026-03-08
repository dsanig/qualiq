
-- Status change history for incidencias
CREATE TABLE public.incidencia_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidencia_id uuid NOT NULL REFERENCES public.incidencias(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  comment text
);

ALTER TABLE public.incidencia_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View incidencia status changes" ON public.incidencia_status_changes
  FOR SELECT TO authenticated
  USING (incidencia_id IN (
    SELECT id FROM incidencias WHERE company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Insert incidencia status changes" ON public.incidencia_status_changes
  FOR INSERT TO authenticated
  WITH CHECK (
    incidencia_id IN (
      SELECT id FROM incidencias WHERE company_id = get_user_company_id(auth.uid())
    )
    AND changed_by = auth.uid()
  );

-- Status change history for reclamaciones
CREATE TABLE public.reclamacion_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamacion_id uuid NOT NULL REFERENCES public.reclamaciones(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  comment text
);

ALTER TABLE public.reclamacion_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reclamacion status changes" ON public.reclamacion_status_changes
  FOR SELECT TO authenticated
  USING (reclamacion_id IN (
    SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Insert reclamacion status changes" ON public.reclamacion_status_changes
  FOR INSERT TO authenticated
  WITH CHECK (
    reclamacion_id IN (
      SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())
    )
    AND changed_by = auth.uid()
  );
