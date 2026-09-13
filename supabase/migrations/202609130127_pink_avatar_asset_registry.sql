-- Pink definitive 3D avatar asset registry.
-- Applied to Supabase project membyrbgynicllzrhjsl.

insert into storage.buckets (id, name, public)
values ('pink-assets', 'pink-assets', true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.pink_avatar_assets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  version text not null,
  bucket_id text not null default 'pink-assets',
  object_path text not null,
  format text not null check (format in ('glb','gltf','vrm')),
  is_active boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pink_avatar_assets_single_active_idx
on public.pink_avatar_assets ((is_active))
where is_active = true;

alter table public.pink_avatar_assets enable row level security;

drop policy if exists "Public can read active Pink avatar" on public.pink_avatar_assets;
create policy "Public can read active Pink avatar"
on public.pink_avatar_assets
for select
to anon, authenticated
using (is_active = true and status = 'active');

create or replace function public.touch_pink_avatar_asset_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pink_avatar_assets_touch_updated_at on public.pink_avatar_assets;
create trigger pink_avatar_assets_touch_updated_at
before update on public.pink_avatar_assets
for each row execute function public.touch_pink_avatar_asset_updated_at();
