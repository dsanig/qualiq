
-- Remove superadmin bypass from status change triggers
CREATE OR REPLACE FUNCTION public.enforce_status_change_responsible_incidencias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.responsible_id IS NULL OR OLD.responsible_id != auth.uid() THEN
      RAISE EXCEPTION 'Solo el responsable asignado puede cambiar el estado de esta incidencia';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_status_change_responsible_reclamaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.responsible_id IS NULL OR OLD.responsible_id != auth.uid() THEN
      RAISE EXCEPTION 'Solo el responsable asignado puede cambiar el estado de esta reclamación';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
