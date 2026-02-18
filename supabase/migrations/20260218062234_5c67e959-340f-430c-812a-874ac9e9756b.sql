
-- Add title and responsible_id to capa_plans
ALTER TABLE public.capa_plans ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.capa_plans ADD COLUMN IF NOT EXISTS responsible_id uuid;

-- Drop the unique constraint on audit_id if it exists (to allow multiple capa plans per audit)
-- The foreign key already exists, we just need to ensure no unique constraint blocks multiple plans
DO $$
BEGIN
  -- Check and drop any unique constraint on audit_id
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.capa_plans'::regclass 
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.capa_plans'::regclass AND attname = 'audit_id')
  ) THEN
    EXECUTE format('ALTER TABLE public.capa_plans DROP CONSTRAINT %I',
      (SELECT conname FROM pg_constraint 
       WHERE conrelid = 'public.capa_plans'::regclass 
       AND contype = 'u'
       AND array_length(conkey, 1) = 1
       AND conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.capa_plans'::regclass AND attname = 'audit_id'))
    );
  END IF;
END $$;

-- Add DELETE policy for document_versions (superadmin only)
CREATE POLICY "Superadmin can delete document versions"
ON public.document_versions
FOR DELETE
USING (is_superadmin(auth.uid()));
