INSERT INTO storage.buckets (id, name, public)
VALUES ('form-logos', 'form-logos', true);

CREATE POLICY "Anyone can view form logos" ON storage.objects FOR
SELECT USING (bucket_id = 'form-logos');

CREATE POLICY "User can upload their own form logos" ON storage.objects FOR
INSERT WITH CHECK (
    bucket_id = 'form-logos'
    AND auth.uid() = owner
);

CREATE POLICY "User can update their own form logos" ON storage.objects FOR
UPDATE USING (
    bucket_id = 'form-logos'
    AND auth.uid() = owner
);

CREATE POLICY "User can delete their own form logos" ON storage.objects FOR
DELETE USING (
    bucket_id = 'form-logos'
    AND auth.uid() = owner
);
