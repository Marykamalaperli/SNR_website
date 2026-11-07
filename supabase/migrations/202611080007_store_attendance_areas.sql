-- Apply once after 0006. Store areas are configured by HR in Sites & Shifts.
-- Existing events and locations remain unchanged; all new punches fail closed.
begin;

create table snr_private.site_attendance_areas (
  organization_id uuid not null,
  site_id uuid not null,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  radius_meters integer not null default 100 check(radius_meters between 10 and 1000),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null,
  primary key(organization_id,site_id),
  foreign key(organization_id,site_id) references public.sites(organization_id,id),
  foreign key(organization_id,updated_by) references public.organization_memberships(organization_id,user_id)
);
alter table snr_private.site_attendance_areas enable row level security;
revoke all on snr_private.site_attendance_areas from public,anon,authenticated;

create function public.hr_site_attendance_area(p_site_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;site public.sites;area snr_private.site_attendance_areas;
begin
  ctx:=snr_private.workforce_context(true);
  select * into site from public.sites where organization_id=ctx.organization_id and id=p_site_id;
  if site.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  select * into area from snr_private.site_attendance_areas where organization_id=ctx.organization_id and site_id=site.id;
  return jsonb_build_object('site_id',site.id,'site_name',site.name,'configured',area.site_id is not null,
    'latitude',area.latitude,'longitude',area.longitude,'radius_meters',coalesce(area.radius_meters,100),'version',area.version);
end $$;

create function public.hr_save_site_attendance_area(p_site_id uuid,p_version integer,p_latitude double precision,
  p_longitude double precision,p_radius_meters integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;site public.sites;area snr_private.site_attendance_areas;
begin
  ctx:=snr_private.workforce_context(true);
  -- Inactive stores may still need an area to close a pre-existing session.
  select * into site from public.sites where organization_id=ctx.organization_id and id=p_site_id for share;
  if site.id is null then raise exception using errcode='PT404',message='record_unavailable';end if;
  if p_latitude is null or not(p_latitude between -90 and 90) or p_longitude is null
    or not(p_longitude between -180 and 180) or p_radius_meters is null or p_radius_meters not between 10 and 1000 then
    raise exception using errcode='PT422',message='invalid_store_area';end if;
  if p_version is null then
    insert into snr_private.site_attendance_areas(organization_id,site_id,latitude,longitude,radius_meters,updated_by)
      values(ctx.organization_id,site.id,p_latitude,p_longitude,p_radius_meters,ctx.user_id)
      on conflict(organization_id,site_id) do nothing returning * into area;
  else
    update snr_private.site_attendance_areas set latitude=p_latitude,longitude=p_longitude,radius_meters=p_radius_meters,
      version=version+1,updated_at=clock_timestamp(),updated_by=ctx.user_id
      where organization_id=ctx.organization_id and site_id=site.id and version=p_version returning * into area;
  end if;
  if area.site_id is null then raise exception using errcode='PT409',message='record_changed';end if;
  perform snr_private.workforce_audit(ctx.organization_id,'site.attendance_area.saved','site',site.id);
  return jsonb_build_object('site_id',site.id,'version',area.version);
end $$;

create function snr_private.store_distance_meters(lat1 double precision,lon1 double precision,
  lat2 double precision,lon2 double precision) returns double precision
language sql immutable strict set search_path='' as $$
  select 12742000.0*asin(sqrt(least(1.0,greatest(0.0,
    power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)))));
$$;
revoke all on function snr_private.store_distance_meters(double precision,double precision,double precision,double precision)
  from public,anon,authenticated;

alter table snr_private.attendance_locations
  add column store_site_id uuid,
  add column store_latitude double precision,
  add column store_longitude double precision,
  add column store_radius_meters integer,
  add column store_policy_version integer,
  add column store_distance_meters double precision,
  add column store_rule_version text,
  add foreign key(organization_id,store_site_id) references public.sites(organization_id,id),
  add constraint attendance_store_snapshot check (
    (store_site_id is null and store_latitude is null and store_longitude is null and store_radius_meters is null
      and store_policy_version is null and store_distance_meters is null and store_rule_version is null)
    or (store_site_id is not null and store_latitude is not null and store_latitude between -90 and 90
      and store_longitude is not null and store_longitude between -180 and 180
      and store_radius_meters is not null and store_radius_meters between 10 and 1000
      and store_policy_version is not null and store_policy_version>0
      and store_distance_meters is not null and store_distance_meters>=0
      and store_distance_meters+accuracy_meters<=store_radius_meters
      and store_rule_version is not null and store_rule_version='store-radius-v1'));

create function snr_private.enforce_attendance_store_area() returns trigger
language plpgsql security definer set search_path='' as $$
declare event public.attendance_events;area snr_private.site_attendance_areas;distance double precision;
begin
  select * into event from public.attendance_events where organization_id=new.organization_id and id=new.event_id;
  if event.id is null or event.event_type not in ('clock_in','clock_out') then
    raise exception using errcode='PT422',message='invalid_attendance_action';end if;
  -- The normal writer derives this site. Clock-out retains the open session's
  -- store, even if a shift expires. No browser-supplied site is accepted.
  select * into area from snr_private.site_attendance_areas
    where organization_id=event.organization_id and site_id=event.site_id for share;
  if area.site_id is null then raise exception using errcode='PT409',message='store_area_not_configured';end if;
  if new.captured_at<clock_timestamp()-interval '2 minutes' or new.captured_at>clock_timestamp()+interval '30 seconds' then
    raise exception using errcode='PT422',message='stale_attendance_location';end if;
  distance:=snr_private.store_distance_meters(area.latitude,area.longitude,new.latitude,new.longitude);
  if distance>area.radius_meters then raise exception using errcode='PT409',message='outside_store_area';end if;
  -- Accuracy never enlarges the allowed area: the reported uncertainty circle
  -- must fit inside it. Rejection rolls back event, location and punch audit.
  if distance+new.accuracy_meters>area.radius_meters then
    raise exception using errcode='PT409',message='store_location_uncertain';end if;
  new.store_site_id:=event.site_id;
  new.store_latitude:=area.latitude;new.store_longitude:=area.longitude;
  new.store_radius_meters:=area.radius_meters;new.store_policy_version:=area.version;
  new.store_distance_meters:=distance;new.store_rule_version:='store-radius-v1';
  return new;
end $$;
revoke all on function snr_private.enforce_attendance_store_area() from public,anon,authenticated;
create trigger attendance_store_area_required before insert on snr_private.attendance_locations
  for each row execute function snr_private.enforce_attendance_store_area();

alter function public.attendance_workspace() set schema snr_private;
alter function snr_private.attendance_workspace() rename to attendance_workspace_without_store_area;
revoke all on function snr_private.attendance_workspace_without_store_area() from public,anon,authenticated;
create function public.attendance_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;target uuid;
begin
  ctx:=snr_private.workforce_context(false);
  result:=snr_private.attendance_workspace_without_store_area()||jsonb_build_object(
    'store_geofence_required',true,'store_geofence_policy','store-radius-v1');
  if ctx.role='employee' then
    if result->>'status'='clocked_in' then
      select site_id into target from public.attendance_events
        where organization_id=ctx.organization_id and id=(result->>'last_event_id')::uuid;
    else
      select site_id into target from public.employee_profiles where organization_id=ctx.organization_id and user_id=ctx.user_id;
    end if;
    return result||jsonb_build_object('attendance_area',(select jsonb_build_object('site_id',s.id,'site_name',s.name,
      'configured',a.site_id is not null,'radius_meters',a.radius_meters)
      from public.sites s left join snr_private.site_attendance_areas a on a.organization_id=s.organization_id and a.site_id=s.id
      where s.organization_id=ctx.organization_id and s.id=target));
  end if;
  return result;
end $$;

alter function public.hr_organization_setup() set schema snr_private;
alter function snr_private.hr_organization_setup() rename to hr_organization_setup_without_store_area;
revoke all on function snr_private.hr_organization_setup_without_store_area() from public,anon,authenticated;
create function public.hr_organization_setup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;sites jsonb;
begin
  ctx:=snr_private.workforce_context(true);
  result:=snr_private.hr_organization_setup_without_store_area();
  select coalesce(jsonb_agg(item||jsonb_build_object('attendance_area_configured',a.site_id is not null,
    'attendance_radius_meters',a.radius_meters) order by n),'[]'::jsonb) into sites
    from jsonb_array_elements(result->'sites') with ordinality records(item,n)
    left join snr_private.site_attendance_areas a on a.organization_id=ctx.organization_id and a.site_id=(item->>'id')::uuid;
  return jsonb_set(result,'{sites}',sites);
end $$;

alter function public.attendance_location_details(uuid) set schema snr_private;
alter function snr_private.attendance_location_details(uuid) rename to attendance_location_details_without_store_area;
revoke all on function snr_private.attendance_location_details_without_store_area(uuid) from public,anon,authenticated;
create function public.attendance_location_details(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx public.organization_memberships;result jsonb;kind text;proof jsonb;
begin
  -- This existing reader enforces employee/HR scope and audits the detail view.
  result:=snr_private.attendance_location_details_without_store_area(p_session_id);
  ctx:=snr_private.workforce_context(false);
  foreach kind in array array['clock_in','clock_out'] loop
    select jsonb_build_object('store_distance_meters',l.store_distance_meters,'store_radius_meters',l.store_radius_meters,
      'store_policy_version',l.store_policy_version,'store_rule_version',l.store_rule_version) into proof
      from public.attendance_events ev join snr_private.attendance_locations l on l.organization_id=ev.organization_id and l.event_id=ev.id
      where ev.organization_id=ctx.organization_id and ev.session_id=p_session_id and ev.event_type=kind;
    if proof is not null then result:=jsonb_set(result,array[kind],(result->kind)||proof);end if;
  end loop;
  return result;
end $$;

revoke all on function public.hr_site_attendance_area(uuid) from public,anon;
revoke all on function public.hr_save_site_attendance_area(uuid,integer,double precision,double precision,integer) from public,anon;
revoke all on function public.attendance_workspace() from public,anon;
revoke all on function public.hr_organization_setup() from public,anon;
revoke all on function public.attendance_location_details(uuid) from public,anon;
grant execute on function public.hr_site_attendance_area(uuid) to authenticated;
grant execute on function public.hr_save_site_attendance_area(uuid,integer,double precision,double precision,integer) to authenticated;
grant execute on function public.attendance_workspace() to authenticated;
grant execute on function public.hr_organization_setup() to authenticated;
grant execute on function public.attendance_location_details(uuid) to authenticated;

commit;
