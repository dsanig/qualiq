
-- Create reclamaciones table
CREATE TABLE public.reclamaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  title text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'otro', -- 'proveedor', 'cliente', 'otro'
  source_code text, -- codigo proveedor/cliente
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  response_deadline date,
  detail text,
  investigation text,
  resolution text,
  conclusion text,
  status text NOT NULL DEFAULT 'abierta', -- abierta, en_revision, en_resolucion, cerrada
  responsible_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reclamaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reclamaciones" ON public.reclamaciones
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Insert reclamaciones" ON public.reclamaciones
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()) AND can_edit_content(auth.uid()));

CREATE POLICY "Update reclamaciones" ON public.reclamaciones
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()) AND can_edit_content(auth.uid()));

CREATE POLICY "Delete reclamaciones" ON public.reclamaciones
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND (can_manage_company(auth.uid()) OR is_superadmin(auth.uid())));

-- Reclamacion attachments
CREATE TABLE public.reclamacion_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamacion_id uuid REFERENCES public.reclamaciones(id) ON DELETE CASCADE NOT NULL,
  bucket_id text NOT NULL DEFAULT 'documents',
  object_path text NOT NULL,
  file_name text,
  file_type text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reclamacion_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reclamacion attachments" ON public.reclamacion_attachments
  FOR SELECT USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Insert reclamacion attachments" ON public.reclamacion_attachments
  FOR INSERT WITH CHECK (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

CREATE POLICY "Delete reclamacion attachments" ON public.reclamacion_attachments
  FOR DELETE USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Reclamacion participants (empleados asignados)
CREATE TABLE public.reclamacion_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamacion_id uuid REFERENCES public.reclamaciones(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reclamacion_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reclamacion participants" ON public.reclamacion_participants
  FOR SELECT USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Manage reclamacion participants" ON public.reclamacion_participants
  FOR ALL USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Link reclamaciones to incidencias
CREATE TABLE public.reclamacion_incidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamacion_id uuid REFERENCES public.reclamaciones(id) ON DELETE CASCADE NOT NULL,
  incidencia_id uuid REFERENCES public.incidencias(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(reclamacion_id, incidencia_id)
);

ALTER TABLE public.reclamacion_incidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reclamacion incidencias" ON public.reclamacion_incidencias
  FOR SELECT USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Insert reclamacion incidencias" ON public.reclamacion_incidencias
  FOR INSERT WITH CHECK (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

CREATE POLICY "Delete reclamacion incidencias" ON public.reclamacion_incidencias
  FOR DELETE USING (reclamacion_id IN (SELECT id FROM reclamaciones WHERE company_id = get_user_company_id(auth.uid())) AND can_edit_content(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_reclamaciones_updated_at
  BEFORE UPDATE ON public.reclamaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
