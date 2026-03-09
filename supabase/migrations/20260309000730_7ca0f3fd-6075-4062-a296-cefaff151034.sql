-- Enforce: only auditor or responsible can UPDATE audits (server-side)

BEGIN;

-- 1) Trigger-based enforcement (extra safety beyond RLS)
DROP TRIGGER IF EXISTS enforce_audit_update_trigger ON public.audits;
CREATE TRIGGER enforce_audit_update_trigger
BEFORE UPDATE ON public.audits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_update_by_auditor_or_responsible();

-- 2) RLS: only auditor/responsible may UPDATE the audit
DROP POLICY IF EXISTS "Update audits" ON public.audits;
CREATE POLICY "Update audits"
ON public.audits
FOR UPDATE
TO public
USING (
  company_id = get_user_company_id(auth.uid())
  AND (auditor_id = auth.uid() OR responsible_id = auth.uid())
);

-- 3) RLS: audit attachments can be managed only by auditor/responsible
DROP POLICY IF EXISTS "Insert audit attachments" ON public.audit_attachments;
CREATE POLICY "Insert audit attachments"
ON public.audit_attachments
FOR INSERT
TO public
WITH CHECK (
  audit_id IN (
    SELECT a.id
    FROM public.audits a
    WHERE a.company_id = get_user_company_id(auth.uid())
      AND (a.auditor_id = auth.uid() OR a.responsible_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Delete audit attachments" ON public.audit_attachments;
CREATE POLICY "Delete audit attachments"
ON public.audit_attachments
FOR DELETE
TO public
USING (
  audit_id IN (
    SELECT a.id
    FROM public.audits a
    WHERE a.company_id = get_user_company_id(auth.uid())
      AND (a.auditor_id = auth.uid() OR a.responsible_id = auth.uid())
  )
);

-- 4) RLS: audit participants can be managed only by auditor/responsible
DROP POLICY IF EXISTS "Manage audit participants" ON public.audit_participants;
CREATE POLICY "Manage audit participants"
ON public.audit_participants
FOR ALL
TO public
USING (
  audit_id IN (
    SELECT a.id
    FROM public.audits a
    WHERE a.company_id = get_user_company_id(auth.uid())
      AND (a.auditor_id = auth.uid() OR a.responsible_id = auth.uid())
  )
)
WITH CHECK (
  audit_id IN (
    SELECT a.id
    FROM public.audits a
    WHERE a.company_id = get_user_company_id(auth.uid())
      AND (a.auditor_id = auth.uid() OR a.responsible_id = auth.uid())
  )
);

COMMIT;
