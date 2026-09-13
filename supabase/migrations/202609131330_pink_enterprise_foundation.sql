-- Pink Phase 11 — Product / Enterprise foundation
create table if not exists public.pink_workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  region text,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, slug)
);
create table if not exists public.pink_workspace_members (
  workspace_id uuid not null references public.pink_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','operator','analyst','viewer')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create table if not exists public.pink_plan_entitlements (
  tenant_id uuid primary key references public.pink_tenants(id) on delete cascade,
  plan text not null default 'personal' check (plan in ('personal','studio','enterprise')),
  status text not null default 'active' check (status in ('active','trial','suspended','cancelled')),
  entitlements jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.pink_usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  metric text not null,
  period_start date not null,
  value numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(tenant_id,metric,period_start)
);
create table if not exists public.pink_data_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('export','deletion')),
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','processing','completed','rejected','cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pink_workspaces_tenant_idx on public.pink_workspaces(tenant_id);
create index if not exists pink_workspace_members_user_idx on public.pink_workspace_members(user_id);
create index if not exists pink_usage_tenant_period_idx on public.pink_usage_counters(tenant_id,period_start);
create index if not exists pink_data_requests_tenant_idx on public.pink_data_requests(tenant_id,created_at desc);
alter table public.pink_workspaces enable row level security;
alter table public.pink_workspace_members enable row level security;
alter table public.pink_plan_entitlements enable row level security;
alter table public.pink_usage_counters enable row level security;
alter table public.pink_data_requests enable row level security;
drop policy if exists pink_workspaces_member_select on public.pink_workspaces;
create policy pink_workspaces_member_select on public.pink_workspaces for select to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_workspaces.tenant_id and m.user_id=(select auth.uid())));
drop policy if exists pink_workspaces_admin_write on public.pink_workspaces;
create policy pink_workspaces_admin_write on public.pink_workspaces for all to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_workspaces.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))) with check (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_workspaces.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
drop policy if exists pink_workspace_members_select on public.pink_workspace_members;
create policy pink_workspace_members_select on public.pink_workspace_members for select to authenticated using (exists (select 1 from public.pink_workspaces w join public.pink_tenant_memberships m on m.tenant_id=w.tenant_id where w.id=pink_workspace_members.workspace_id and m.user_id=(select auth.uid())));
drop policy if exists pink_workspace_members_admin_write on public.pink_workspace_members;
create policy pink_workspace_members_admin_write on public.pink_workspace_members for all to authenticated using (exists (select 1 from public.pink_workspaces w join public.pink_tenant_memberships m on m.tenant_id=w.tenant_id where w.id=pink_workspace_members.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))) with check (exists (select 1 from public.pink_workspaces w join public.pink_tenant_memberships m on m.tenant_id=w.tenant_id where w.id=pink_workspace_members.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
drop policy if exists pink_entitlements_member_select on public.pink_plan_entitlements;
create policy pink_entitlements_member_select on public.pink_plan_entitlements for select to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_plan_entitlements.tenant_id and m.user_id=(select auth.uid())));
drop policy if exists pink_usage_member_select on public.pink_usage_counters;
create policy pink_usage_member_select on public.pink_usage_counters for select to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_usage_counters.tenant_id and m.user_id=(select auth.uid())));
drop policy if exists pink_data_requests_member_select on public.pink_data_requests;
create policy pink_data_requests_member_select on public.pink_data_requests for select to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_data_requests.tenant_id and m.user_id=(select auth.uid())));
drop policy if exists pink_data_requests_member_insert on public.pink_data_requests;
create policy pink_data_requests_member_insert on public.pink_data_requests for insert to authenticated with check (requested_by=(select auth.uid()) and exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_data_requests.tenant_id and m.user_id=(select auth.uid())));
drop policy if exists pink_data_requests_admin_update on public.pink_data_requests;
create policy pink_data_requests_admin_update on public.pink_data_requests for update to authenticated using (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_data_requests.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))) with check (exists (select 1 from public.pink_tenant_memberships m where m.tenant_id=pink_data_requests.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
