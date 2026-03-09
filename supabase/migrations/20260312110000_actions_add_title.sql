-- Add mandatory title field to corrective/preventive actions with safe backfill.
ALTER TABLE public.actions
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

ALTER TABLE public.actions
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE public.actions
  ADD CONSTRAINT actions_title_not_blank CHECK (char_length(btrim(title)) > 0);
