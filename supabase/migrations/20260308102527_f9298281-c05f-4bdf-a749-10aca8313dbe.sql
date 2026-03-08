CREATE OR REPLACE FUNCTION public.check_document_workflow_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _doc_id uuid;
  _doc_status text;
  _total_reviews int;
  _completed_reviews int;
  _total_signatures int;
  _completed_signatures int;
  _total_approvals int;
  _completed_approvals int;
BEGIN
  _doc_id := NEW.document_id;

  SELECT status::text INTO _doc_status FROM public.documents WHERE id = _doc_id;

  SELECT
    COUNT(*) FILTER (WHERE action_type = 'revision'),
    COUNT(*) FILTER (WHERE action_type = 'revision' AND status = 'completed')
  INTO _total_reviews, _completed_reviews
  FROM public.document_responsibilities
  WHERE document_id = _doc_id;

  SELECT
    COUNT(*) FILTER (WHERE action_type = 'firma'),
    COUNT(*) FILTER (WHERE action_type = 'firma' AND status = 'completed')
  INTO _total_signatures, _completed_signatures
  FROM public.document_responsibilities
  WHERE document_id = _doc_id;

  SELECT
    COUNT(*) FILTER (WHERE action_type = 'aprobacion'),
    COUNT(*) FILTER (WHERE action_type = 'aprobacion' AND status = 'completed')
  INTO _total_approvals, _completed_approvals
  FROM public.document_responsibilities
  WHERE document_id = _doc_id;

  -- Auto-transition: review -> pending_signature
  IF _doc_status = 'review' AND _total_reviews > 0 AND _completed_reviews = _total_reviews THEN
    UPDATE public.documents SET status = 'pending_signature' WHERE id = _doc_id;
    INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
    VALUES (_doc_id, 'review', 'pending_signature', NEW.user_id, 'Transición automática: todas las revisiones completadas');
    _doc_status := 'pending_signature';
  END IF;

  -- Auto-transition: pending_signature -> pending_approval
  IF _doc_status = 'pending_signature' AND _total_signatures > 0 AND _completed_signatures = _total_signatures THEN
    UPDATE public.documents SET status = 'pending_approval' WHERE id = _doc_id;
    INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
    VALUES (_doc_id, 'pending_signature', 'pending_approval', NEW.user_id, 'Transición automática: todas las firmas completadas');
    _doc_status := 'pending_approval';
  END IF;

  -- Auto-transition: pending_approval -> approved
  IF _doc_status = 'pending_approval' AND _total_approvals > 0 AND _completed_approvals = _total_approvals THEN
    UPDATE public.documents SET status = 'approved' WHERE id = _doc_id;
    INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
    VALUES (_doc_id, 'pending_approval', 'approved', NEW.user_id, 'Transición automática: todas las aprobaciones completadas');
  END IF;

  RETURN NEW;
END;
$function$