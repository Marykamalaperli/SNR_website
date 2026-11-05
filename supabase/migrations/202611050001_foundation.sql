-- DRAFT: review and exercise in an isolated Supabase project before use.
-- This migration is never run by application startup, CI, or environment setup.
begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table public.roles (
  name text primary key check (name in ('employee', 'supervisor', 'hr', 'security_auditor', 'system_owner'))
);
insert into public.roles(name) values ('employee'), ('supervisor'), ('hr'), ('security_auditor'), ('system_owner');

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null references public.roles(name),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  active boolean not null default true,
  unique (organization_id, id)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null,
  department_id uuid not null,
  site_id uuid not null,
  employee_number text not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id),
  unique (organization_id, employee_number),
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, department_id) references public.departments(organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id)
);

create table public.supervisor_assignments (
  organization_id uuid not null,
  supervisor_user_id uuid not null,
  department_id uuid not null,
  site_id uuid not null,
  primary key (organization_id, supervisor_user_id, department_id, site_id),
  foreign key (organization_id, supervisor_user_id) references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, department_id) references public.departments(organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  site_id uuid not null,
  name text not null,
  starts_at time not null,
  ends_at time not null,
  timezone text not null,
  unique (organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id)
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  starts_on date not null,
  ends_on date,
  check (ends_on is null or ends_on >= starts_on),
  foreign key (organization_id, employee_id) references public.employee_profiles(organization_id, id),
  foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  site_id uuid not null,
  event_type text not null check (event_type in ('clock_in', 'clock_out', 'correction')),
  occurred_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid not null,
  idempotency_key uuid not null,
  corrects_event_id uuid,
  correction_request_id uuid,
  unique (organization_id, id),
  unique (organization_id, employee_id, idempotency_key),
  foreign key (organization_id, employee_id) references public.employee_profiles(organization_id, id),
  foreign key (organization_id, shift_id) references public.shifts(organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id),
  foreign key (organization_id, actor_user_id) references public.organization_memberships(organization_id, user_id),
  foreign key (organization_id, corrects_event_id) references public.attendance_events(organization_id, id),
  check ((event_type = 'correction') = (correction_request_id is not null))
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_id uuid not null,
  attendance_date date not null,
  requested_type text not null check (requested_type in ('clock_in', 'clock_out')),
  requested_at timestamptz not null,
  reason text not null check (length(reason) between 10 and 1000),
  submitted_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee_profiles(organization_id, id)
);
alter table public.attendance_events add constraint attendance_correction_fk
  foreign key (organization_id, correction_request_id) references public.correction_requests(organization_id, id);

create table public.approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  correction_request_id uuid not null,
  actor_user_id uuid not null,
  decision text not null check (decision in ('recommend', 'flag', 'approve', 'reject')),
  note text not null check (length(note) between 5 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, correction_request_id) references public.correction_requests(organization_id, id),
  foreign key (organization_id, actor_user_id) references public.organization_memberships(organization_id, user_id)
);
-- Only one final decision. Recommendations remain part of the append-only record.
create unique index one_final_correction_decision on public.approval_events(organization_id, correction_request_id)
  where decision in ('approve', 'reject');

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_user_id uuid not null,
  action text not null,
  subject_type text not null,
  subject_id uuid not null,
  request_id text not null check (length(request_id) between 8 and 64),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, actor_user_id) references public.organization_memberships(organization_id, user_id)
);

create table public.document_metadata (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_employee_id uuid not null,
  name text not null,
  category text not null,
  -- Storage paths and signed URLs are not exposed through this table.
  created_at timestamptz not null default now(),
  foreign key (organization_id, owner_employee_id) references public.employee_profiles(organization_id, id)
);

create index membership_user_lookup on public.organization_memberships(user_id, organization_id) where active;
create index employee_scope_lookup on public.employee_profiles(organization_id, department_id, site_id);
create index attendance_employee_time on public.attendance_events(organization_id, employee_id, occurred_at desc);
create index corrections_employee_time on public.correction_requests(organization_id, employee_id, submitted_at desc);
create index approvals_request on public.approval_events(organization_id, correction_request_id);

create schema if not exists snr_private;
revoke all on schema snr_private from public;
grant usage on schema snr_private to authenticated;

-- Definer functions have fixed empty search paths, no dynamic SQL, and return
-- only scoped booleans/role strings. The schema must never be exposed via PostgREST.
create function snr_private.current_role(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_memberships m
  where m.organization_id = org and m.user_id = (select auth.uid()) and m.active
$$;

create function snr_private.can_read_employee(org uuid, employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee_profiles e
    join public.organization_memberships m on m.organization_id = e.organization_id
      and m.user_id = (select auth.uid()) and m.active
    where e.organization_id = org and e.id = employee and (
      m.role = 'hr'
      or (m.role = 'employee' and e.user_id = m.user_id)
      or (m.role = 'supervisor' and exists (
        select 1 from public.supervisor_assignments s where s.organization_id = org
          and s.supervisor_user_id = m.user_id
          and s.department_id = e.department_id and s.site_id = e.site_id
      ))
    )
  )
$$;
revoke all on function snr_private.current_role(uuid) from public;
revoke all on function snr_private.can_read_employee(uuid, uuid) from public;
grant execute on function snr_private.current_role(uuid) to authenticated;
grant execute on function snr_private.can_read_employee(uuid, uuid) to authenticated;

-- Explicit list: no grant/revoke against unrelated existing public tables.
do $$
declare tbl text;
begin
  foreach tbl in array array['organizations', 'roles', 'organization_memberships', 'sites',
    'departments', 'employee_profiles', 'supervisor_assignments', 'shifts',
    'shift_assignments', 'attendance_events', 'correction_requests',
    'approval_events', 'audit_events', 'document_metadata'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
  end loop;
end $$;

create policy organization_read on public.organizations for select to authenticated
  using (snr_private.current_role(id) is not null);
create policy role_names_read on public.roles for select to authenticated using (true);
create policy own_membership_read on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) and active);
create policy employee_read on public.employee_profiles for select to authenticated
  using (snr_private.can_read_employee(organization_id, id));
create policy sites_hr_read on public.sites for select to authenticated
  using (snr_private.current_role(organization_id) = 'hr');
create policy departments_hr_read on public.departments for select to authenticated
  using (snr_private.current_role(organization_id) = 'hr');
create policy own_supervision_read on public.supervisor_assignments for select to authenticated
  using (supervisor_user_id = (select auth.uid()) and snr_private.current_role(organization_id) = 'supervisor');
create policy shift_assignments_read on public.shift_assignments for select to authenticated
  using (snr_private.can_read_employee(organization_id, employee_id));
create policy shifts_hr_read on public.shifts for select to authenticated
  using (snr_private.current_role(organization_id) = 'hr');
create policy attendance_read on public.attendance_events for select to authenticated
  using (snr_private.can_read_employee(organization_id, employee_id));
create policy correction_read on public.correction_requests for select to authenticated
  using (snr_private.can_read_employee(organization_id, employee_id));
create policy approval_read on public.approval_events for select to authenticated using (
  exists (select 1 from public.correction_requests c where c.organization_id = approval_events.organization_id
    and c.id = approval_events.correction_request_id and snr_private.can_read_employee(c.organization_id, c.employee_id))
);
-- Auditor is deliberately distinct. HR and owner do not get this policy.
create policy auditor_read on public.audit_events for select to authenticated
  using (snr_private.current_role(organization_id) = 'security_auditor');
-- Deny document metadata by default until approved category-specific policies exist.
-- No INSERT/UPDATE/DELETE policies: all browser writes are denied.

create function snr_private.reject_history_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'History is append-only; create a linked event instead';
end $$;
revoke all on function snr_private.reject_history_mutation() from public;
create trigger attendance_append_only before update or delete on public.attendance_events
  for each row execute function snr_private.reject_history_mutation();
create trigger approvals_append_only before update or delete on public.approval_events
  for each row execute function snr_private.reject_history_mutation();
create trigger audit_append_only before update or delete on public.audit_events
  for each row execute function snr_private.reject_history_mutation();
create trigger requests_append_only before update or delete on public.correction_requests
  for each row execute function snr_private.reject_history_mutation();

commit;
