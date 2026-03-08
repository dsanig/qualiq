
-- Add responsible_id to audits
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS responsible_id uuid;

-- Create audit_participants junction table
CREATE TABLE IF NOT EXISTS public.audit_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(audit_id, user_id)
);

ALTER TABLE public.audit_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audit participants"
  ON public.audit_participants FOR SELECT
  USING (audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Manage audit participants"
  ON public.audit_participants FOR ALL
  USING (
    audit_id IN (SELECT id FROM public.audits WHERE company_id = get_user_company_id(auth.uid()))
    AND can_edit_content(auth.uid())
  );
