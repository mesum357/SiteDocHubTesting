-- ============================================================
-- SiteDocHB — User Approval Workflow
-- ============================================================

-- 1. Add status column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- 2. Update existing users to 'approved' (so they don't get locked out)
UPDATE profiles SET status = 'approved' WHERE status = 'pending';

-- 3. Update handle_new_user trigger logic
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
  initial_status TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'requested_role', 'field_worker');
  
  -- Prevent malicious users from requesting admin role
  IF requested_role = 'admin' THEN
    requested_role := 'field_worker';
  END IF;

  -- Admin or first users could be auto-approved, but here we follow the rule:
  -- Workers need approval. If we want the first admin to be approved, we do it via seed.
  initial_status := 'pending';

  -- Special case: If it's an admin being created (e.g. via seed or dashboard with bypass), 
  -- we might want to auto-approve, but usually the trigger handles self-signup.
  -- For now, let's keep it simple: everything from signup is pending.
  
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 
    requested_role,
    initial_status
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update RLS policies to restrict to approved users
-- We only change the policies for jobs, floors, and pins.
-- Profiles should still be readable by authenticated users (to see names), 
-- but maybe we should restrict that too? Let's keep it for now.

DROP POLICY IF EXISTS "Authenticated access on jobs" ON jobs;
DROP POLICY IF EXISTS "Authenticated access on floors" ON floors;
DROP POLICY IF EXISTS "Authenticated access on pins" ON pins;

CREATE POLICY "Approved access on jobs" ON jobs 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Approved access on floors" ON floors 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Approved access on pins" ON pins 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'approved'
    )
  );
