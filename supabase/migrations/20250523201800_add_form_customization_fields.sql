ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN forms.primary_color IS 'Primary color for form styling (hex code)';
COMMENT ON COLUMN forms.secondary_color IS 'Secondary color for form styling (hex code)';
COMMENT ON COLUMN forms.logo_url IS 'URL to the form logo image in Supabase storage';
