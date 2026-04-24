-- ============================================================
-- SiteViewPro — Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. JOBS TABLE
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  archived    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. FLOORS TABLE
CREATE TABLE IF NOT EXISTS floors (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  floor_order INTEGER DEFAULT 0,
  pdf_path    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. PINS TABLE
CREATE TABLE IF NOT EXISTS pins (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  floor_id       TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  x_pct          REAL NOT NULL,
  y_pct          REAL NOT NULL,
  pin_order      INTEGER DEFAULT 0,
  photo_path     TEXT,
  photo_taken_at TIMESTAMPTZ,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. INDEXES for fast lookups
CREATE INDEX IF NOT EXISTS idx_floors_job_id ON floors(job_id);
CREATE INDEX IF NOT EXISTS idx_pins_floor_id ON pins(floor_id);

-- 5. ROW LEVEL SECURITY (allow all for now — tighten later with auth)
ALTER TABLE jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins   ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (for development — replace with auth-based policies in production)
CREATE POLICY "Allow all on jobs"   ON jobs   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on floors" ON floors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pins"   ON pins   FOR ALL USING (true) WITH CHECK (true);

-- 6. Updated_at trigger for jobs
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. STORAGE BUCKET for floor plan PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('floor-plans', 'floor-plans', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to floor-plans bucket
CREATE POLICY "Public read floor-plans"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'floor-plans');

-- Allow uploads to floor-plans bucket (open for dev — restrict with auth in production)
CREATE POLICY "Allow uploads to floor-plans"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'floor-plans');

-- Allow updates (upsert) to floor-plans bucket
CREATE POLICY "Allow updates to floor-plans"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'floor-plans');
