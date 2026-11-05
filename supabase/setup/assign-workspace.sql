-- Project-owner SQL Editor only. Set the EXISTING organization UUID, email and exact role.
-- This query does not overwrite or reactivate an existing membership.
begin;
do $$
declare
  target_organization uuid := null; -- Replace null with 'actual-organization-uuid'::uuid.
  target_email text := 'REPLACE_WITH_CONFIRMED_EMAIL';
  target_role text := 'employee'; -- employee, supervisor, hr, security_auditor, system_owner.
  target_user uuid;
  confirmed_at timestamptz;
begin
  if target_organization is null or position('@' in target_email) < 2 then
    raise exception 'Set the organization UUID and confirmed email before running this query.';
  end if;
  if not exists (select 1 from public.organizations where id=target_organization) then
    raise exception 'The selected organization does not exist.';
  end if;
  if target_role not in ('employee','supervisor','hr','security_auditor','system_owner') then
    raise exception 'Choose one explicit supported role.';
  end if;
  select u.id,u.email_confirmed_at into target_user,confirmed_at from auth.users u
    where lower(u.email)=lower(target_email);
  if target_user is null or confirmed_at is null then
    raise exception 'Create and confirm this Auth user first.';
  end if;
  if exists (select 1 from public.organization_memberships m
    where m.organization_id=target_organization and m.user_id=target_user) then
    raise exception 'A membership already exists. Review changes explicitly; nothing was overwritten.';
  end if;
  insert into public.organization_memberships(organization_id,user_id,role)
    values(target_organization,target_user,target_role);
end $$;
commit;
