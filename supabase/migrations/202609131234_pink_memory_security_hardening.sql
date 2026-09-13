create schema if not exists private;

create or replace function private.pink_is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pink_tenant_memberships m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
  );
$$;

revoke all on function private.pink_is_tenant_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pink_is_tenant_member(uuid) to authenticated;

create or replace function public.pink_is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select private.pink_is_tenant_member(p_tenant_id);
$$;

revoke all on function public.pink_is_tenant_member(uuid) from public, anon;
grant execute on function public.pink_is_tenant_member(uuid) to authenticated;

revoke all on function public.pink_bootstrap_auth_user() from public, anon, authenticated;
