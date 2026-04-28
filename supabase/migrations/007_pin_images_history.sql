-- Keep upload history for each pin while preserving pins.photo_path as latest.
create table if not exists public.pin_images (
  id uuid primary key default gen_random_uuid(),
  pin_id text not null references public.pins(id) on delete cascade,
  photo_path text not null,
  photo_taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_images_pin_id on public.pin_images(pin_id);
create index if not exists idx_pin_images_taken_at on public.pin_images(photo_taken_at desc);

alter table public.pin_images enable row level security;

drop policy if exists "Approved access on pin_images" on public.pin_images;
create policy "Approved access on pin_images"
on public.pin_images
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
  )
);
