-- ============================================================
-- SiteDocHB — Pin Photos Storage Bucket (PRIVATE)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. STORAGE BUCKET for pin 360° photos (PRIVATE — access via signed URLs only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-photos', 'pin-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Authenticated users can read pin-photos
CREATE POLICY "Authenticated read pin-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pin-photos' AND auth.role() = 'authenticated');

-- Authenticated users can upload to pin-photos
CREATE POLICY "Authenticated upload pin-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pin-photos' AND auth.role() = 'authenticated');

-- Authenticated users can update (upsert) pin-photos
CREATE POLICY "Authenticated update pin-photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pin-photos' AND auth.role() = 'authenticated');

-- Authenticated users can delete from pin-photos (needed for pin removal cleanup)
CREATE POLICY "Authenticated delete pin-photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pin-photos' AND auth.role() = 'authenticated');
