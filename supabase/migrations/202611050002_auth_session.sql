-- Apply after the foundation migration. Read-only authorization, no auto-provisioning.
begin;

create function public.current_workspace() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  caller uuid := auth.uid();
  assignments bigint;
  membership public.organization_memberships%rowtype;
  organization_name text;
  employee_id uuid;
  employee_name text;
  employee_site uuid;
  team_ids uuid[] := '{}'::uuid[];
  site_ids uuid[] := '{}'::uuid[];
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;

  -- RLS also enforces user ownership. No caller-provided role/org/user parameters.
  select count(*) into assignments from public.organization_memberships m
    where m.user_id = caller and m.active;
  if assignments = 0 then
    raise exception using errcode = 'PT403', message = 'workspace_not_assigned';
  elsif assignments > 1 then
    raise exception using errcode = 'PT409', message = 'multiple_workspaces_require_selection';
  end if;
  select m.* into strict membership from public.organization_memberships m
    where m.user_id = caller and m.active;
  select o.name into organization_name from public.organizations o
    where o.id = membership.organization_id;
  if organization_name is null then
    raise exception using errcode = 'PT403', message = 'workspace_unavailable';
  end if;

  select e.id, e.display_name, e.site_id into employee_id, employee_name, employee_site
    from public.employee_profiles e where e.organization_id = membership.organization_id
      and e.user_id = caller and e.active;
  if membership.role = 'supervisor' then
    select coalesce(array_agg(distinct s.department_id), '{}'::uuid[]),
      coalesce(array_agg(distinct s.site_id), '{}'::uuid[])
      into team_ids, site_ids from public.supervisor_assignments s
      where s.organization_id = membership.organization_id and s.supervisor_user_id = caller;
  elsif membership.role = 'hr' then
    select coalesce(array_agg(s.id), '{}'::uuid[]) into site_ids from public.sites s
      where s.organization_id = membership.organization_id and s.active;
  elsif membership.role = 'employee' and employee_site is not null then
    site_ids := array[employee_site];
  end if;

  return jsonb_build_object(
    'user_id', caller,
    'organization_id', membership.organization_id,
    'organization_name', organization_name,
    'role', membership.role,
    'employee_id', employee_id,
    'display_name', employee_name,
    'team_ids', team_ids,
    'site_ids', site_ids
  );
end $$;

revoke all on function public.current_workspace() from public, anon;
grant execute on function public.current_workspace() to authenticated;
comment on function public.current_workspace() is
  'Read-only current membership under RLS. No role self-assignment or private workforce mutations.';
commit;
