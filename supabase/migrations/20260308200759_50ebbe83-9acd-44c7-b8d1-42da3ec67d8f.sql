
-- Table to store superadmin's active company context
CREATE TABLE public.superadmin_context (
  user_id uuid PRIMARY KEY,
  active_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.superadmin_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage own context"
ON public.superadmin_context
FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()) AND user_id = auth.uid())
WITH CHECK (is_superadmin(auth.uid()) AND user_id = auth.uid());

-- Modify get_user_company_id to respect superadmin override
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  override_id uuid;
BEGIN
  IF is_superadmin(_user_id) THEN
    SELECT active_company_id INTO override_id
    FROM superadmin_context
    WHERE user_id = _user_id;
    IF override_id IS NOT NULL THEN
      RETURN override_id;
    END IF;
  END IF;
  RETURN (SELECT company_id FROM profiles WHERE user_id = _user_id);
END;
$$;
