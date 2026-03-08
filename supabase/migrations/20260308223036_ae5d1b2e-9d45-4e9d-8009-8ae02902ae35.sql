
CREATE TABLE public.audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  user_email text,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_title text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_trail_company_id ON public.audit_trail(company_id);
CREATE INDEX idx_audit_trail_user_id ON public.audit_trail(user_id);
CREATE INDEX idx_audit_trail_created_at ON public.audit_trail(created_at DESC);
CREATE INDEX idx_audit_trail_entity_type ON public.audit_trail(entity_type);
CREATE INDEX idx_audit_trail_action ON public.audit_trail(action);

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own audit entries
CREATE POLICY "Users can insert own audit entries"
  ON public.audit_trail
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admins and superadmins can view audit trail
CREATE POLICY "Admins can view audit trail"
  ON public.audit_trail
  FOR SELECT
  TO authenticated
  USING (
    (is_superadmin(auth.uid()) AND (company_id = get_user_company_id(auth.uid()) OR company_id IS NULL))
    OR (can_manage_company(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  );
