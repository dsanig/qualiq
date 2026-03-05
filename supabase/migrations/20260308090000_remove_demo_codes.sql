-- Remove legacy demo-code surface to prevent demo workflows in production.
DROP TABLE IF EXISTS public.demo_codes CASCADE;
