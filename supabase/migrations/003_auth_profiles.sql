-- ============================================================
-- SiteDocHB — Profiles & RBAC
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'field_worker',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Trigger to create a profile automatically on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent malicious users from requesting admin role during signup
  IF COALESCE(NEW.raw_user_meta_data->>'requested_role', 'field_worker') = 'admin' THEN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'field_worker');
  ELSE
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'requested_role', 'field_worker'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Row Level Security for Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read all profiles (needed for UI features like displaying names)
CREATE POLICY "Allow read all profiles" 
  ON profiles FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Allow admins to update roles
CREATE POLICY "Admins can update profiles" 
  ON profiles FOR UPDATE 
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Allow users to update their own profile name
CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 4. Secure core tables (Jobs, Floors, Pins) to authenticated users only
-- Drop the wide open dev policies
DROP POLICY IF EXISTS "Allow all on jobs" ON jobs;
DROP POLICY IF EXISTS "Allow all on floors" ON floors;
DROP POLICY IF EXISTS "Allow all on pins" ON pins;

-- Restrict to authenticated
CREATE POLICY "Authenticated access on jobs" ON jobs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated access on floors" ON floors FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated access on pins" ON pins FOR ALL USING (auth.role() = 'authenticated');
