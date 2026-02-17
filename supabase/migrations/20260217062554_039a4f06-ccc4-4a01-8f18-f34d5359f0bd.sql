
-- Create company_features table for feature toggles
CREATE TABLE public.company_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, feature_key)
);

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

-- Superadmin can do everything
CREATE POLICY "Superadmin full access" ON public.company_features
  FOR ALL USING (is_superadmin(auth.uid()));

-- Company members can view their features
CREATE POLICY "View own company features" ON public.company_features
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

-- Seed default features for existing companies
INSERT INTO public.company_features (company_id, feature_key, enabled)
SELECT c.id, f.key, true
FROM public.companies c
CROSS JOIN (VALUES 
  ('documents'), ('processes'), ('incidents'), ('audits'), 
  ('training'), ('audit-simulator'), ('predictive-analytics'), ('chatbot')
) AS f(key)
ON CONFLICT DO NOTHING;

-- Remove subscription columns from companies
ALTER TABLE public.companies 
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS subscription_tier;

-- Drop the enum type if no longer used
DROP TYPE IF EXISTS public.subscription_tier;
