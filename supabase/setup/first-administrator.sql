-- Run only in Supabase SQL Editor as the project owner, after both migrations.
-- Edit the email below. The Auth user must already exist and have a confirmed email.
-- This initializes an EMPTY organization database; it never promotes a user automatically.
begin;
do $$
declare
  administrator_email text := 'REPLACE_WITH_YOUR_CONFIRMED_EMAIL';
  administrator_id uuid;
  confirmed_at timestamptz;
  created_organization_id uuid;
begin
  if position('@' in administrator_email) < 2 then
    raise exception 'Edit administrator_email before running this setup query.';
  end if;
  if exists (select 1 from public.organizations) then
    raise exception 'Organizations already exist. Review them and use assign-workspace.sql instead.';
  end if;
  select u.id, u.email_confirmed_at into administrator_id, confirmed_at
    from auth.users u where lower(u.email) = lower(administrator_email);
  if administrator_id is null or confirmed_at is null then
    raise exception 'Create and confirm this Auth user before assigning HR access.';
  end if;
  insert into public.organizations(name) values ('SNR NEST') returning id into created_organization_id;
  insert into public.organization_memberships(organization_id,user_id,role)
    values (created_organization_id,administrator_id,'hr');
  raise notice 'Created organization %. HR access assigned to the explicitly selected account.', created_organization_id;
end $$;
commit;
