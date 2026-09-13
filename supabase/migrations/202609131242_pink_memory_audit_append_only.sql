drop policy if exists pink_audit_member_all on public.pink_audit_log;

create policy pink_audit_member_select on public.pink_audit_log
for select to authenticated
using (public.pink_is_tenant_member(tenant_id));

create policy pink_audit_member_insert on public.pink_audit_log
for insert to authenticated
with check (
  public.pink_is_tenant_member(tenant_id)
  and (actor_user_id is null or actor_user_id = auth.uid())
);
