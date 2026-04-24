-- =============================================================================
-- SiteViewPro — Initial Database Schema Migration
-- =============================================================================
-- Run this on a fresh Supabase project. Order matters:
-- 1. Enums  2. Tables  3. Triggers  4. Helpers  5. RLS  6. Storage
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

create type user_role as enum ('field_worker', 'office_staff', 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles — auto-created on signup via trigger
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       user_role not null default 'field_worker',
  created_at timestamptz default now()
);

-- jobs — top-level container for a photo walk
create table jobs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default 'Photo Walk',
  created_date date not null default current_date,
  created_by   uuid references auth.users(id),
  archived     boolean not null default false,
  created_at   timestamptz default now()
);

-- floors — each job has one or more floors with optional PDF plan
create table floors (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  label       text not null default 'Floor 1',
  floor_order int not null default 1,
  pdf_path    text,
  created_at  timestamptz default now()
);

-- pins — placed on a floor plan, may have a 360° photo
create table pins (
  id             uuid primary key default gen_random_uuid(),
  floor_id       uuid not null references floors(id) on delete cascade,
  name           text not null,
  x_pct          float8 not null check (x_pct >= 0 and x_pct <= 1),
  y_pct          float8 not null check (y_pct >= 0 and y_pct <= 1),
  pin_order      int not null default 0,
  photo_path     text,
  note           text,
  photo_taken_at timestamptz,
  created_at     timestamptz default now()
);

-- shares — shareable read-only links for a job
create table shares (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  token      text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS — auto-create profile on signup
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    'field_worker'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- get_my_role() — returns the current user's role, used in all RLS policies
create or replace function get_my_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- get_signed_url() — placeholder for signed URL generation
-- NOTE: Actual signed URLs are generated client-side via the Supabase JS SDK
-- using supabase.storage.from(bucket).createSignedUrl(path, expiresIn).
-- This function is included per spec but is not used in practice.
create or replace function get_signed_url(bucket text, path text, expires_in int default 3600)
returns text as $$
declare
  result text;
begin
  select storage.foldername(name) into result
  from storage.objects
  where bucket_id = bucket and name = path;
  return result;
end;
$$ language plpgsql security definer;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY — enable + policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table jobs     enable row level security;
alter table floors   enable row level security;
alter table pins     enable row level security;
alter table shares   enable row level security;


-- ── profiles ────────────────────────────────────────────────────────────────

-- Users can read their own profile
create policy "profiles_select_own"
  on profiles for select
  using (id = auth.uid());

-- Admins can read all profiles
create policy "profiles_select_admin"
  on profiles for select
  using (get_my_role() = 'admin');

-- Admins can update any profile (for role assignment)
create policy "profiles_update_admin"
  on profiles for update
  using (get_my_role() = 'admin');

-- Users can update their own name only (not role)
create policy "profiles_update_own"
  on profiles for update
  using (id = auth.uid());


-- ── jobs ────────────────────────────────────────────────────────────────────

-- field_worker: can only SELECT non-archived jobs (read-only)
create policy "jobs_select_field"
  on jobs for select
  using (auth.uid() is not null and not archived);

-- office_staff and admin: full CRUD
create policy "jobs_insert_office_admin"
  on jobs for insert
  with check (get_my_role() in ('office_staff', 'admin'));

create policy "jobs_update_office_admin"
  on jobs for update
  using (get_my_role() in ('office_staff', 'admin'));

create policy "jobs_delete_admin"
  on jobs for delete
  using (get_my_role() = 'admin');


-- ── floors ──────────────────────────────────────────────────────────────────

-- All authenticated users can view floors
create policy "floors_select_all_auth"
  on floors for select
  using (auth.uid() is not null);

-- office_staff and admin: full CRUD
create policy "floors_insert_office_admin"
  on floors for insert
  with check (get_my_role() in ('office_staff', 'admin'));

create policy "floors_update_office_admin"
  on floors for update
  using (get_my_role() in ('office_staff', 'admin'));

create policy "floors_delete_admin"
  on floors for delete
  using (get_my_role() = 'admin');


-- ── pins ────────────────────────────────────────────────────────────────────

-- All authenticated users can view pins
create policy "pins_select_all_auth"
  on pins for select
  using (auth.uid() is not null);

-- field_worker: can UPDATE pins (to add photo_path, note, photo_taken_at)
-- NOTE: Postgres RLS is row-level, not column-level. The frontend enforces
-- that field_workers only send photo/note updates via permissions.ts gating.
create policy "pins_update_field"
  on pins for update
  using (auth.uid() is not null)
  with check (
    get_my_role() = 'field_worker'
  );

-- office_staff and admin: full CRUD including placement
create policy "pins_insert_office_admin"
  on pins for insert
  with check (get_my_role() in ('office_staff', 'admin'));

create policy "pins_update_office_admin"
  on pins for update
  using (get_my_role() in ('office_staff', 'admin'));

create policy "pins_delete_office_admin"
  on pins for delete
  using (get_my_role() in ('office_staff', 'admin'));


-- ── shares ──────────────────────────────────────────────────────────────────

-- office_staff and admin can create share links
create policy "shares_insert_office_admin"
  on shares for insert
  with check (get_my_role() in ('office_staff', 'admin'));

-- office_staff and admin can view all shares
create policy "shares_select_office_admin"
  on shares for select
  using (get_my_role() in ('office_staff', 'admin'));

-- admin can delete shares
create policy "shares_delete_admin"
  on shares for delete
  using (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKETS
-- ─────────────────────────────────────────────────────────────────────────────

-- floor-plans bucket — private, for PDF floor plan uploads
-- File path convention: {job_id}/{floor_id}/plan.pdf
insert into storage.buckets (id, name, public)
values ('floor-plans', 'floor-plans', false);

-- site-photos bucket — private, for 360° photos
-- File path convention: {job_id}/{floor_id}/{pin_id}.jpg
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. STORAGE RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── floor-plans ─────────────────────────────────────────────────────────────

-- SELECT: all authenticated users can read (to view floor plans on mobile)
create policy "floor_plans_select"
  on storage.objects for select
  using (bucket_id = 'floor-plans' and auth.uid() is not null);

-- INSERT: office_staff and admin only (uploading PDFs)
create policy "floor_plans_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'floor-plans'
    and get_my_role() in ('office_staff', 'admin')
  );

-- UPDATE: office_staff and admin only
create policy "floor_plans_update"
  on storage.objects for update
  using (
    bucket_id = 'floor-plans'
    and get_my_role() in ('office_staff', 'admin')
  );

-- DELETE: admin only
create policy "floor_plans_delete"
  on storage.objects for delete
  using (
    bucket_id = 'floor-plans'
    and get_my_role() = 'admin'
  );

-- ── site-photos ─────────────────────────────────────────────────────────────

-- SELECT: all authenticated users
create policy "site_photos_select"
  on storage.objects for select
  using (bucket_id = 'site-photos' and auth.uid() is not null);

-- INSERT: all authenticated users (field workers upload photos)
create policy "site_photos_insert"
  on storage.objects for insert
  with check (bucket_id = 'site-photos' and auth.uid() is not null);

-- UPDATE: all authenticated users
create policy "site_photos_update"
  on storage.objects for update
  using (bucket_id = 'site-photos' and auth.uid() is not null);

-- DELETE: office_staff and admin only
create policy "site_photos_delete"
  on storage.objects for delete
  using (
    bucket_id = 'site-photos'
    and get_my_role() in ('office_staff', 'admin')
  );
