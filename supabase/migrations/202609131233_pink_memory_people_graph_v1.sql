create extension if not exists pgcrypto;

create table if not exists public.pink_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pink_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pink_tenant_memberships (
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  user_id uuid not null references public.pink_users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create or replace function public.pink_is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.pink_tenant_memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()); $$;

create or replace function public.pink_bootstrap_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_tenant_id uuid := gen_random_uuid();
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'display_name',''), 'Pink User');
begin
  insert into public.pink_users(id, display_name, metadata)
  values (new.id, v_name, jsonb_build_object('is_anonymous', coalesce((new.is_anonymous)::boolean, false)))
  on conflict (id) do nothing;

  insert into public.pink_tenants(id, slug, name, metadata)
  values (v_tenant_id, 'personal-' || replace(new.id::text, '-', ''), 'Pink Personal', jsonb_build_object('bootstrap','auth-trigger'))
  on conflict (slug) do update set updated_at = now()
  returning id into v_tenant_id;

  insert into public.pink_tenant_memberships(tenant_id, user_id, role)
  values (v_tenant_id, new.id, 'owner')
  on conflict (tenant_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists pink_auth_user_bootstrap on auth.users;
create trigger pink_auth_user_bootstrap after insert on auth.users for each row execute function public.pink_bootstrap_auth_user();

create table if not exists public.pink_people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  source text not null default 'self-reported' check (source in ('self-reported','user-provided','imported')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, normalized_name)
);

create table if not exists public.pink_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  subject_person_id uuid not null references public.pink_people(id) on delete cascade,
  target_user_id uuid references public.pink_users(id) on delete set null,
  target_label text not null default 'Paulo',
  relationship_type text not null,
  source text not null default 'self-reported',
  confidence numeric(4,3) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, subject_person_id, target_label)
);

create table if not exists public.pink_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  project_key text not null,
  name text not null,
  repo text,
  deployment_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_key)
);

create table if not exists public.pink_project_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  project_id uuid not null references public.pink_projects(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, normalized_alias)
);

create table if not exists public.pink_project_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  project_id uuid not null references public.pink_projects(id) on delete cascade,
  memory_type text not null default 'fact',
  content_text text not null,
  content_json jsonb not null default '{}'::jsonb,
  importance numeric(4,3) not null default 0.5 check (importance >= 0 and importance <= 1),
  fingerprint text not null,
  source text not null default 'conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, fingerprint)
);

create table if not exists public.pink_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  user_id uuid not null references public.pink_users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','cancelled','timeout')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.pink_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  session_id uuid references public.pink_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  retained boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.pink_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  user_id uuid references public.pink_users(id) on delete set null,
  person_id uuid references public.pink_people(id) on delete cascade,
  project_id uuid references public.pink_projects(id) on delete cascade,
  memory_type text not null,
  content_text text not null,
  content_json jsonb not null default '{}'::jsonb,
  importance numeric(4,3) not null default 0.5 check (importance >= 0 and importance <= 1),
  fingerprint text not null,
  source text not null default 'conversation',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fingerprint)
);

create table if not exists public.pink_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  session_id uuid references public.pink_sessions(id) on delete set null,
  observation_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pink_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  session_id uuid references public.pink_sessions(id) on delete set null,
  action_type text not null,
  risk_class text not null default 'READ_ONLY',
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.pink_audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  actor_user_id uuid references public.pink_users(id) on delete set null,
  event_type text not null,
  object_type text,
  object_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pink_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  provider text not null,
  status text not null default 'configured',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.pink_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  user_id uuid references public.pink_users(id) on delete cascade,
  device_key text not null,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, device_key)
);

create table if not exists public.pink_evolution_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  title text not null,
  status text not null default 'proposed',
  value_score numeric(6,3),
  risk_score numeric(6,3),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pink_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  candidate_id uuid references public.pink_evolution_candidates(id) on delete cascade,
  reviewer text not null,
  verdict text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pink_experiments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  candidate_id uuid references public.pink_evolution_candidates(id) on delete cascade,
  branch_name text,
  status text not null default 'planned',
  metrics_before jsonb not null default '{}'::jsonb,
  metrics_after jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pink_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  action_id uuid references public.pink_actions(id) on delete cascade,
  risk_class text not null,
  status text not null default 'pending',
  approved_by uuid references public.pink_users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.pink_deployments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.pink_tenants(id) on delete cascade,
  project_id uuid references public.pink_projects(id) on delete cascade,
  environment text not null,
  commit_sha text,
  status text not null,
  preview_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pink_people_tenant_last_seen_idx on public.pink_people(tenant_id, last_seen_at desc);
create index if not exists pink_memories_lookup_idx on public.pink_memories(tenant_id, memory_type, importance desc, updated_at desc);
create index if not exists pink_project_memory_lookup_idx on public.pink_project_memory(tenant_id, project_id, importance desc, updated_at desc);
create index if not exists pink_observations_tenant_created_idx on public.pink_observations(tenant_id, created_at desc);
create index if not exists pink_actions_tenant_created_idx on public.pink_actions(tenant_id, created_at desc);
create index if not exists pink_audit_tenant_created_idx on public.pink_audit_log(tenant_id, created_at desc);

alter table public.pink_users enable row level security;
alter table public.pink_tenants enable row level security;
alter table public.pink_tenant_memberships enable row level security;
alter table public.pink_people enable row level security;
alter table public.pink_relationships enable row level security;
alter table public.pink_projects enable row level security;
alter table public.pink_project_aliases enable row level security;
alter table public.pink_project_memory enable row level security;
alter table public.pink_sessions enable row level security;
alter table public.pink_conversations enable row level security;
alter table public.pink_memories enable row level security;
alter table public.pink_observations enable row level security;
alter table public.pink_actions enable row level security;
alter table public.pink_audit_log enable row level security;
alter table public.pink_integrations enable row level security;
alter table public.pink_devices enable row level security;
alter table public.pink_evolution_candidates enable row level security;
alter table public.pink_reviews enable row level security;
alter table public.pink_experiments enable row level security;
alter table public.pink_approvals enable row level security;
alter table public.pink_deployments enable row level security;

create policy pink_users_select_self on public.pink_users for select to authenticated using (id = auth.uid());
create policy pink_users_update_self on public.pink_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy pink_tenants_member_select on public.pink_tenants for select to authenticated using (public.pink_is_tenant_member(id));
create policy pink_memberships_member_select on public.pink_tenant_memberships for select to authenticated using (user_id = auth.uid() or public.pink_is_tenant_member(tenant_id));
create policy pink_people_member_all on public.pink_people for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_relationships_member_all on public.pink_relationships for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_projects_member_all on public.pink_projects for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_project_aliases_member_all on public.pink_project_aliases for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_project_memory_member_all on public.pink_project_memory for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_sessions_member_all on public.pink_sessions for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id) and user_id = auth.uid());
create policy pink_conversations_member_all on public.pink_conversations for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_memories_member_all on public.pink_memories for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_observations_member_all on public.pink_observations for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_actions_member_all on public.pink_actions for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_audit_member_all on public.pink_audit_log for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_integrations_member_all on public.pink_integrations for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_devices_member_all on public.pink_devices for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_evolution_candidates_member_all on public.pink_evolution_candidates for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_reviews_member_all on public.pink_reviews for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_experiments_member_all on public.pink_experiments for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_approvals_member_all on public.pink_approvals for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));
create policy pink_deployments_member_all on public.pink_deployments for all to authenticated using (public.pink_is_tenant_member(tenant_id)) with check (public.pink_is_tenant_member(tenant_id));

grant execute on function public.pink_is_tenant_member(uuid) to authenticated;
