-- ============================================================
-- SiteDocHB — Seed Admin User
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

DO $$
DECLARE
  new_admin_id UUID := gen_random_uuid();
BEGIN
  -- 1. Insert the admin user into auth.users if they don't exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@sitedochb.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_admin_id,
      'authenticated',
      'authenticated',
      'admin@sitedochb.com',
      crypt('AdminPassword123!', gen_salt('bf')),
      current_timestamp,
      NULL,
      current_timestamp,
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"System Admin"}',
      current_timestamp,
      current_timestamp,
      '',
      '',
      '',
      ''
    );
  END IF;

  -- 2. Ensure the admin profile exists in public.profiles and set the role.
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@sitedochb.com') THEN
    INSERT INTO public.profiles (id, email, full_name, role)
    SELECT id, email, 'System Admin', 'admin'
    FROM auth.users
    WHERE email = 'admin@sitedochb.com'
    ON CONFLICT (id) DO UPDATE SET role = 'admin';
  END IF;
END $$;
