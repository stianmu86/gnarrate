-- ============================================================================
-- Narrate — PDF Support Migration (Sprint 6)
-- Adds pdf_storage_path and pdf_page_count columns, plus storage RLS for pdfs bucket
-- ============================================================================

-- Add PDF-specific columns to narrations
ALTER TABLE narrations ADD COLUMN IF NOT EXISTS pdf_storage_path text;
ALTER TABLE narrations ADD COLUMN IF NOT EXISTS pdf_page_count int;

-- --------------------------------------------------------------------------
-- Storage RLS for pdfs bucket
-- --------------------------------------------------------------------------

-- Users can upload PDFs to their own folder (pdfs/{user_id}/...)
CREATE POLICY "Users can upload PDFs to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own PDFs
CREATE POLICY "Users can read own PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own PDFs
CREATE POLICY "Users can delete own PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
