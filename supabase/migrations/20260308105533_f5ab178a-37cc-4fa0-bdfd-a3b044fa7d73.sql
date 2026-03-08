
ALTER TABLE public.non_conformities ADD COLUMN IF NOT EXISTS responsible_id uuid DEFAULT NULL;
