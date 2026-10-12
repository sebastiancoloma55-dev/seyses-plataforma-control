-- SEYSES isolated data model, row-level security, and role helper.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'operator' check (role in ('admin','operator','auditor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null, actor_email text,
  action text not null, module text not null, entity_type text, entity_id text,
  outcome text not null default 'success' check (outcome in ('success','failure','warning')),
  details jsonb not null default '{}'::jsonb, request_id text, created_at timestamptz not null default now()
);
create table if not exists public.process_runs (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  started_at timestamptz not null default now(), finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, process_type text not null,
  status text not null default 'started' check (status in ('started','completed','failed','cancelled')),
  source_filename text, records_read integer not null default 0, records_processed integer not null default 0,
  differences_found integer not null default 0, error_summary text, metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.processed_files (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  process_run_id uuid references public.process_runs(id) on delete set null,
  original_filename text not null, file_kind text not null, storage_path text, content_type text,
  file_size_bytes bigint, checksum_sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded','processing','processed','failed','archived')),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), rut text, full_name text not null, afp text,
  health_provider text, branch text, employment_status text, payroll_status text,
  access_status text, seyses_status text,
  source_process_id uuid references public.process_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.discrepancies (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  process_run_id uuid references public.process_runs(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null, rut text, full_name text,
  category text not null, severity text not null default 'warning' check (severity in ('info','warning','critical')),
  description text not null, status text not null default 'open' check (status in ('open','in_review','resolved','ignored')),
  resolved_by uuid references auth.users(id) on delete set null, resolved_at timestamptz,
  resolution_notes text, metadata jsonb not null default '{}'::jsonb
);
create or replace function public.seyses_current_role()
returns text language sql stable security definer set search_path = ''
as $function$
  select role from public.user_profiles where user_id = auth.uid() and active = true limit 1
$function$;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.process_runs enable row level security;
alter table public.processed_files enable row level security;
alter table public.workers enable row level security;
alter table public.discrepancies enable row level security;

create policy "Users can read own profile or admins can read all" on public.user_profiles
for select to authenticated using (user_id = auth.uid() or public.seyses_current_role() = 'admin');
create policy "Admins can manage profiles" on public.user_profiles
for all to authenticated using (public.seyses_current_role() = 'admin') with check (public.seyses_current_role() = 'admin');
create policy "Admins and auditors can read audit logs" on public.audit_logs
for select to authenticated using (public.seyses_current_role() in ('admin','auditor'));
create policy "Authenticated users can append audit logs" on public.audit_logs
for insert to authenticated with check (user_id = auth.uid() or user_id is null);
create policy "Authenticated users can read process runs" on public.process_runs
for select to authenticated using (public.seyses_current_role() in ('admin','operator','auditor'));
create policy "Authenticated users can create process runs" on public.process_runs
for insert to authenticated with check (created_by = auth.uid() or created_by is null);
create policy "Admins and operators can update process runs" on public.process_runs
for update to authenticated using (public.seyses_current_role() in ('admin','operator')) with check (public.seyses_current_role() in ('admin','operator'));
create policy "Authenticated users can read processed files" on public.processed_files
for select to authenticated using (public.seyses_current_role() in ('admin','operator','auditor'));
create policy "Authenticated users can register processed files" on public.processed_files
for insert to authenticated with check (uploaded_by = auth.uid() or uploaded_by is null);
create policy "Admins and operators can update processed files" on public.processed_files
for update to authenticated using (public.seyses_current_role() in ('admin','operator')) with check (public.seyses_current_role() in ('admin','operator'));
create policy "Authenticated users can read workers" on public.workers
for select to authenticated using (public.seyses_current_role() in ('admin','operator','auditor'));
create policy "Admins and operators can insert workers" on public.workers
for insert to authenticated with check (public.seyses_current_role() in ('admin','operator'));
create policy "Admins and operators can update workers" on public.workers
for update to authenticated using (public.seyses_current_role() in ('admin','operator')) with check (public.seyses_current_role() in ('admin','operator'));
create policy "Authenticated users can read discrepancies" on public.discrepancies
for select to authenticated using (public.seyses_current_role() in ('admin','operator','auditor'));
create policy "Admins and operators can create discrepancies" on public.discrepancies
for insert to authenticated with check (public.seyses_current_role() in ('admin','operator'));
create policy "Admins and operators can update discrepancies" on public.discrepancies
for update to authenticated using (public.seyses_current_role() in ('admin','operator')) with check (public.seyses_current_role() in ('admin','operator'));
