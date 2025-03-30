-- Add short_id column to forms table
ALTER TABLE public.forms ADD COLUMN short_id TEXT;

-- Generate a random short_id for existing forms
UPDATE public.forms 
SET short_id = SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)
WHERE short_id IS NULL;

-- Set short_id to be NOT NULL after populating existing rows
ALTER TABLE public.forms ALTER COLUMN short_id SET NOT NULL;

-- Add a unique index on short_id to ensure uniqueness
CREATE UNIQUE INDEX idx_forms_short_id ON public.forms(short_id);

-- Add expiration date column to forms table (nullable)
ALTER TABLE public.forms ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

-- Update RLS policy for form responses to check expiration date
DROP POLICY IF EXISTS "Users can create responses to forms" ON public.form_responses;

CREATE POLICY "Users can create responses to non-expired forms" ON public.form_responses 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.forms
    WHERE forms.id = form_responses.form_id
      AND (forms.expires_at IS NULL OR forms.expires_at > NOW())
  )
);