INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-pdfs', 'shared-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload shared PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'shared-pdfs');

CREATE POLICY "Service role can read shared PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'shared-pdfs' AND auth.role() = 'service_role');