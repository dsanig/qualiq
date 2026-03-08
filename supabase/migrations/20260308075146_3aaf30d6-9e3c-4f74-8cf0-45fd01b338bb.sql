
-- Add deadline column to training_records
ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS deadline date DEFAULT NULL;
