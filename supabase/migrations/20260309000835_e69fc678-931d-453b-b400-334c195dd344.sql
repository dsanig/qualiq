-- Remove overly-permissive "Service can *" RLS policies (service role bypasses RLS)

BEGIN;

DROP POLICY IF EXISTS "Service can insert audit findings" ON public.audit_findings;
DROP POLICY IF EXISTS "Service can update download count" ON public.document_share_links;
DROP POLICY IF EXISTS "Service can insert pattern detections" ON public.pattern_detections;
DROP POLICY IF EXISTS "Service can delete predictive insights" ON public.predictive_insights;
DROP POLICY IF EXISTS "Service can insert predictive insights" ON public.predictive_insights;
DROP POLICY IF EXISTS "Service can insert training questions" ON public.training_questions;

COMMIT;
