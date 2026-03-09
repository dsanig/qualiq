-- Fix: Allow audit deletion by setting audit_id to NULL on linked incidencias
BEGIN;

-- Drop existing FK and recreate with ON DELETE SET NULL
ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_audit_id_fkey;

ALTER TABLE public.incidencias
  ADD CONSTRAINT incidencias_audit_id_fkey
  FOREIGN KEY (audit_id) REFERENCES public.audits(id)
  ON DELETE SET NULL;

COMMIT;