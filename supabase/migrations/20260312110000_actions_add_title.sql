-- Add mandatory title field to corrective/preventive actions with safe backfill.
ALTER TABLE IF EXISTS public.actions
  ADD COLUMN IF NOT EXISTS title text;

WITH normalized AS (
  SELECT
    id,
    btrim(regexp_replace(COALESCE(description, ''), '\\s+', ' ', 'g')) AS clean_description
  FROM public.actions
),
backfill AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        btrim(
          regexp_replace(
            left(clean_description, 120),
            '\\s+\\S*$',
            ''
          )
        ),
        ''
      ),
      NULLIF(left(clean_description, 120), ''),
      'Acción correctiva sin título'
    ) AS generated_title
  FROM normalized
)
UPDATE public.actions a
SET title = b.generated_title
FROM backfill b
WHERE a.id = b.id
  AND (a.title IS NULL OR btrim(a.title) = '');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND column_name = 'title'
      AND is_nullable = 'YES'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.actions
    WHERE title IS NULL OR btrim(title) = ''
  ) THEN
    ALTER TABLE public.actions
      ALTER COLUMN title SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'actions_title_not_blank'
      AND conrelid = 'public.actions'::regclass
  ) THEN
    ALTER TABLE public.actions
      ADD CONSTRAINT actions_title_not_blank CHECK (char_length(btrim(title)) > 0);
  END IF;
END
$$;

-- Ensure PostgREST (Supabase API) refreshes the schema cache immediately after DDL.
NOTIFY pgrst, 'reload schema';
