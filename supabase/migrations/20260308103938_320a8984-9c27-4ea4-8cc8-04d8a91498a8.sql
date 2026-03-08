
-- Trigger to prevent status changes by non-responsible users on incidencias
CREATE OR REPLACE FUNCTION public.enforce_status_change_responsible_incidencias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only enforce when status is actually changing
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Allow superadmins
    IF public.is_superadmin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    -- Only the assigned responsible can change the status
    IF OLD.responsible_id IS NULL OR OLD.responsible_id != auth.uid() THEN
      RAISE EXCEPTION 'Solo el responsable asignado puede cambiar el estado de esta incidencia';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_status_change_responsible_incidencias
  BEFORE UPDATE ON public.incidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_status_change_responsible_incidencias();

-- Trigger to prevent status changes by non-responsible users on reclamaciones
CREATE OR REPLACE FUNCTION public.enforce_status_change_responsible_reclamaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only enforce when status is actually changing
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Allow superadmins
    IF public.is_superadmin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    -- Only the assigned responsible can change the status
    IF OLD.responsible_id IS NULL OR OLD.responsible_id != auth.uid() THEN
      RAISE EXCEPTION 'Solo el responsable asignado puede cambiar el estado de esta reclamación';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_status_change_responsible_reclamaciones
  BEFORE UPDATE ON public.reclamaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_status_change_responsible_reclamaciones();
