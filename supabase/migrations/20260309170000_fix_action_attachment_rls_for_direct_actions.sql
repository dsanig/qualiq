-- Allow action attachment access based on action.company_id, including actions not linked to a non_conformity.

DROP POLICY IF EXISTS "View attach" ON public.action_attachments;
DROP POLICY IF EXISTS "Insert attach" ON public.action_attachments;
DROP POLICY IF EXISTS action_attachments_admin_full_access ON public.action_attachments;
DROP POLICY IF EXISTS action_attachments_viewer_read_only ON public.action_attachments;

CREATE POLICY "View action attachments"
ON public.action_attachments
FOR SELECT
USING (
  action_id IN (
    SELECT a.id
    FROM public.actions a
    WHERE a.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Insert action attachments"
ON public.action_attachments
FOR INSERT
WITH CHECK (
  action_id IN (
    SELECT a.id
    FROM public.actions a
    WHERE a.company_id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);

CREATE POLICY "Delete action attachments"
ON public.action_attachments
FOR DELETE
USING (
  action_id IN (
    SELECT a.id
    FROM public.actions a
    WHERE a.company_id = get_user_company_id(auth.uid())
  )
  AND can_edit_content(auth.uid())
);
