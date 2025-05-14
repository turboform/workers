CREATE TABLE IF NOT EXISTS public.form_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE NOT NULL,
  integration_type TEXT NOT NULL, -- 'slack', 'email', 'telegram', 'zapier', 'make', 'webhook'
  is_enabled BOOLEAN DEFAULT true,
  config JSONB NOT NULL, -- Configuration specific to the integration type
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.form_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Form owners can manage their form integrations" ON public.form_integrations FOR ALL USING (
  EXISTS (
    SELECT 1 
    FROM public.forms
    WHERE forms.id = form_integrations.form_id
      AND forms.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_form_integrations_form_id ON public.form_integrations(form_id);
CREATE INDEX IF NOT EXISTS idx_form_integrations_type ON public.form_integrations(integration_type);
