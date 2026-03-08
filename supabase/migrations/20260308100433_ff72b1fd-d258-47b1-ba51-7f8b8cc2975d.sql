
-- Add pending_approval to document_status enum
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- Replace the trigger function to handle the full workflow
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
BEGIN
  _doc_id := NEW.document_id;

  -- Get current document status
  SELECT status::text INTO _doc_status FROM public.documents WHERE id = _doc_id;

  -- Count review responsibilities
  SELECT
    COUNT(*) FILTER (WHERE action_type = 'revision'),
    COUNT(*) FILTER (WHERE action_type = 'revision' AND status = 'completed')
  INTO _total_reviews, _completed_reviews
  FROM public.document_responsibilities
  WHERE document_id = _doc_id;

  -- Count signature responsibilities
  SELECT
    COUNT(*) FILTER (WHERE action_type = 'firma'),
    COUNT(*) FILTER (WHERE action_type = 'firma' AND status = 'completed')
  INTO _total_signatures, _completed_signatures
  FROM public.document_responsibilities
  WHERE document_id = _doc_id;

  -- Auto-transition: review -> pending_signature (when all reviews completed)
  IF _doc_status = 'review' AND _total_reviews > 0 AND _completed_reviews = _total_reviews THEN
    UPDATE public.documents SET status = 'pending_signature' WHERE id = _doc_id;
    
    INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
    VALUES (_doc_id, 'review', 'pending_signature', NEW.user_id, 'Transición automática: todas las revisiones completadas');
  END IF;

  -- Auto-transition: pending_signature -> pending_approval (when all signatures completed)
  IF (_doc_status = 'pending_signature' OR 
      (_doc_status = 'review' AND _total_reviews > 0 AND _completed_reviews = _total_reviews))
     AND _total_signatures > 0 AND _completed_signatures = _total_signatures THEN
    UPDATE public.documents SET status = 'pending_approval' WHERE id = _doc_id;
    
    INSERT INTO public.document_status_changes (document_id, old_status, new_status, changed_by, comment)
    VALUES (_doc_id, 'pending_signature', 'pending_approval', NEW.user_id, 'Transición automática: todas las firmas completadas');
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on document_responsibilities
DROP TRIGGER IF EXISTS trg_check_document_workflow ON public.document_responsibilities;
CREATE TRIGGER trg_check_document_workflow
  AFTER UPDATE ON public.document_responsibilities
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status <> 'completed')
  EXECUTE FUNCTION public.check_document_workflow_transition();
