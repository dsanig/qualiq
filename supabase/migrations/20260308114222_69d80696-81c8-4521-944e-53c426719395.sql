
-- Add new columns to companies table for multi-tenant SaaS
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'standard';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Generate slugs for existing companies
UPDATE public.companies SET slug = lower(replace(name, ' ', '-')) WHERE slug IS NULL;

-- Make slug NOT NULL after populating
ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;

-- Allow superadmin full access to companies
CREATE POLICY "Superadmin full access to companies"
ON public.companies
FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()));

-- Allow superadmin to insert companies
CREATE POLICY "Superadmin can insert companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin(auth.uid()));

-- Allow superadmin to delete companies
CREATE POLICY "Superadmin can delete companies"
ON public.companies
FOR DELETE
TO authenticated
USING (is_superadmin(auth.uid()));
