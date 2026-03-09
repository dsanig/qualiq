-- Add optional descriptive fields for non-conformities.
-- Safe for existing rows: new columns are nullable and added with IF NOT EXISTS.
ALTER TABLE public.non_conformities
  ADD COLUMN IF NOT EXISTS internal_investigation text,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS conclusion text;
