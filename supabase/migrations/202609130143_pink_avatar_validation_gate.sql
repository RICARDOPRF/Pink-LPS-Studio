alter table public.pink_avatar_assets
  add column if not exists validation_status text not null default 'pending',
  add column if not exists rig_profile text not null default 'unknown',
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists validated_at timestamptz,
  add column if not exists validation_notes text;

alter table public.pink_avatar_assets
  drop constraint if exists pink_avatar_assets_validation_status_check;
alter table public.pink_avatar_assets
  add constraint pink_avatar_assets_validation_status_check
  check (validation_status in ('pending','approved','rejected'));

alter table public.pink_avatar_assets
  drop constraint if exists pink_avatar_assets_rig_profile_check;
alter table public.pink_avatar_assets
  add constraint pink_avatar_assets_rig_profile_check
  check (rig_profile in ('unknown','static','humanoid','facial','facial-humanoid'));

alter table public.pink_avatar_assets
  drop constraint if exists pink_avatar_assets_approved_requires_timestamp;
alter table public.pink_avatar_assets
  add constraint pink_avatar_assets_approved_requires_timestamp
  check (validation_status <> 'approved' or validated_at is not null);

alter table public.pink_avatar_assets
  drop constraint if exists pink_avatar_assets_active_requires_validated_rig;
alter table public.pink_avatar_assets
  add constraint pink_avatar_assets_active_requires_validated_rig
  check (
    not is_active or (
      status = 'active'
      and validation_status = 'approved'
      and rig_profile = 'facial-humanoid'
    )
  );

drop policy if exists "Public can read active Pink avatar" on public.pink_avatar_assets;
drop policy if exists "Public can read validated active Pink avatar" on public.pink_avatar_assets;
create policy "Public can read validated active Pink avatar"
on public.pink_avatar_assets
for select
to anon, authenticated
using (
  is_active = true
  and status = 'active'
  and validation_status = 'approved'
  and rig_profile = 'facial-humanoid'
);

create or replace function public.activate_pink_avatar_asset(target_id uuid)
returns public.pink_avatar_assets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected public.pink_avatar_assets;
begin
  select * into selected
  from public.pink_avatar_assets
  where id = target_id
  for update;

  if selected.id is null then
    raise exception 'Pink avatar asset not found';
  end if;
  if selected.validation_status <> 'approved' or selected.rig_profile <> 'facial-humanoid' then
    raise exception 'Pink avatar asset must be approved with facial-humanoid rig before activation';
  end if;

  update public.pink_avatar_assets
  set is_active = false,
      status = case when id = target_id then status else case when status = 'active' then 'archived' else status end end,
      updated_at = now()
  where is_active = true or id = target_id;

  update public.pink_avatar_assets
  set is_active = true,
      status = 'active',
      updated_at = now()
  where id = target_id
  returning * into selected;

  return selected;
end;
$$;

revoke all on function public.activate_pink_avatar_asset(uuid) from public, anon, authenticated;
grant execute on function public.activate_pink_avatar_asset(uuid) to service_role;
