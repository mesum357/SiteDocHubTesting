-- Ensure share-link infrastructure exists on projects created from lightweight schema.
-- Safe to run multiple times.

create table if not exists public.shares (
  id         text primary key default gen_random_uuid()::text,
  job_id     text not null references public.jobs(id) on delete cascade,
  token      text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_shares_job_id on public.shares(job_id);
create index if not exists idx_shares_token on public.shares(token);

alter table public.shares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shares' and policyname = 'Allow read shares'
  ) then
    create policy "Allow read shares"
      on public.shares
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shares' and policyname = 'Allow insert shares'
  ) then
    create policy "Allow insert shares"
      on public.shares
      for insert
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shares' and policyname = 'Allow delete shares'
  ) then
    create policy "Allow delete shares"
      on public.shares
      for delete
      using (true);
  end if;
end $$;

