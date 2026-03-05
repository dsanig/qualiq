-- Persistencia de lectura/conversión de insights CAPA y trazabilidad con incidencias
ALTER TABLE public.predictive_insights
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS read_by UUID,
  ADD COLUMN IF NOT EXISTS converted_to_incident_id UUID,
  ADD COLUMN IF NOT EXISTS source JSONB;

ALTER TABLE public.predictive_insights
  ADD CONSTRAINT predictive_insights_read_by_fkey
    FOREIGN KEY (read_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.predictive_insights
  ADD CONSTRAINT predictive_insights_converted_to_incident_id_fkey
    FOREIGN KEY (converted_to_incident_id) REFERENCES public.incidencias(id) ON DELETE SET NULL;

ALTER TABLE public.incidencias
  ADD COLUMN IF NOT EXISTS source_insight_id UUID REFERENCES public.predictive_insights(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_predictive_insights_company_read_at
  ON public.predictive_insights(company_id, read_at);

CREATE INDEX IF NOT EXISTS idx_incidencias_source_insight_id
  ON public.incidencias(source_insight_id);

DROP POLICY IF EXISTS "Company members can mark predictive insights as read" ON public.predictive_insights;
CREATE POLICY "Company members can mark predictive insights as read"
  ON public.predictive_insights FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
