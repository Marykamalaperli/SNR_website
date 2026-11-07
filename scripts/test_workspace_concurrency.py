"""Two actual DB sessions; disposable harness container only, never a customer URL."""

import os
import re
import subprocess
import sys
import time

container_id = sys.argv[1]
if not re.fullmatch(r"[a-f0-9]{12,64}", container_id):
    raise SystemExit("Pass the disposable test container ID.")
environment = os.environ.copy()
for selector in (
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
):
    environment.pop(selector, None)
command = [
    "docker",
    "--host=unix:///var/run/docker.sock",
    "exec",
    "--interactive",
    container_id,
    "psql",
    "--username=postgres",
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=sqlstate",
]


def query(sql: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        command, input=sql, text=True, capture_output=True, env=environment, timeout=15, check=True
    )


query("""
insert into auth.users(id,email,email_confirmed_at) values
 ('a1000000-0000-4000-8000-000000000001','concurrent-admin@example.invalid',now());
insert into public.organizations(id,name) values
 ('a2000000-0000-4000-8000-000000000001','Concurrent settings');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','hr');
create function snr_private.test_delay_settings() returns trigger language plpgsql as $$
begin perform pg_sleep(0.8);return new;end $$;
create trigger zzz_test_delay_settings before update on public.organizations for each row
 when (old.id='a2000000-0000-4000-8000-000000000001')
 execute function snr_private.test_delay_settings();
""")
prefix = """begin;set role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001"}',true);
"""
first = subprocess.Popen(
    command,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=environment,
)
first.stdin.write(
    "set application_name='snr-settings-first';"
    + prefix
    + "select public.hr_save_workspace_settings(1,'First settings','UTC','First admin');commit;"
)
first.stdin.close()
deadline = time.monotonic() + 6
while time.monotonic() < deadline:
    if (
        query(
            "select count(*) from pg_stat_activity "
            "where application_name='snr-settings-first' and wait_event='PgSleep';"
        ).stdout.strip()
        == "1"
    ):
        break
    if first.poll() is not None:
        raise SystemExit("The first settings request exited before the concurrent check.")
    time.sleep(0.03)
else:
    raise SystemExit("The first settings request did not reach the test synchronization point.")
second = subprocess.run(
    command,
    input=prefix
    + "select public.hr_save_workspace_settings(1,'Stale settings','UTC','Stale admin');commit;",
    text=True,
    capture_output=True,
    env=environment,
    timeout=15,
)
first.wait(timeout=15)
if first.returncode != 0 or second.returncode == 0 or "PT409" not in second.stderr:
    raise SystemExit(
        "Concurrent settings must produce one success and one stale-version denial, "
        "never a deadlock."
    )
query("""
do $$ begin
 assert (select name from public.organizations
  where id='a2000000-0000-4000-8000-000000000001')='First settings';
 assert (select display_name from public.organization_memberships
  where user_id='a1000000-0000-4000-8000-000000000001')='First admin';
 assert (select count(*) from public.audit_events
  where organization_id='a2000000-0000-4000-8000-000000000001')=1;
end $$;
drop trigger zzz_test_delay_settings on public.organizations;
drop function snr_private.test_delay_settings();
""")
print(
    "PASS: concurrent settings preserve winning data/audit and reject stale edits without deadlock"
)

# Real attendance contention. The production writer and HR profile mutations use
# the same lock order; the test delay gives both sessions a deterministic overlap.
query("""
insert into auth.users(id,email,email_confirmed_at)
select ('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'concurrent-attendance-'||n||'@example.invalid',now() from generate_series(1,5)n;
insert into public.organizations(id,name,timezone) values
 ('d2000000-0000-4000-8000-000000000001','Concurrent attendance','UTC');
insert into public.organization_memberships(organization_id,user_id,role)
select 'd2000000-0000-4000-8000-000000000001',
 ('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=1 then 'hr' else 'employee' end from generate_series(1,5)n;
insert into public.sites(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Main','UTC'),
 ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Other','UTC');
insert into public.departments(id,organization_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Operations');
insert into public.employee_profiles(id,organization_id,user_id,site_id,department_id,
 employee_number,display_name)
select ('d4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd2000000-0000-4000-8000-000000000001',
 ('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd3000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
 'CONCURRENT-'||n,'Concurrent person '||n from generate_series(2,5)n;
insert into public.shifts(id,organization_id,site_id,name,starts_at,ends_at,timezone) values
 ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
 'd3000000-0000-4000-8000-000000000001','Day','00:00','23:59:59','UTC');
insert into public.shift_assignments(organization_id,employee_id,shift_id,starts_on)
select 'd2000000-0000-4000-8000-000000000001',id,'d6000000-0000-4000-8000-000000000001',
 (now() at time zone 'UTC')::date from public.employee_profiles
 where organization_id='d2000000-0000-4000-8000-000000000001';
create function snr_private.test_delay_attendance() returns trigger language plpgsql as $$
begin perform pg_sleep(0.8);return new;end $$;
create trigger zzz_test_delay_attendance before insert on public.attendance_events for each row
 when (new.organization_id='d2000000-0000-4000-8000-000000000001')
 execute function snr_private.test_delay_attendance();
""")


def as_user(number: int) -> str:
    subject = f"d1000000-0000-4000-8000-{number:012d}"
    return (
        "begin;set role authenticated;select set_config('request.jwt.claims',"
        f'\'{{"sub":"{subject}"}}\',true);'
    )


def overlap(first_sql: str, second_sql: str) -> subprocess.CompletedProcess:
    first = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    first.stdin.write("set application_name='snr-attendance-first';" + first_sql)
    first.stdin.close()
    deadline = time.monotonic() + 6
    while time.monotonic() < deadline:
        if (
            query(
                "select count(*) from pg_stat_activity where "
                "application_name='snr-attendance-first' and wait_event='PgSleep';"
            ).stdout.strip()
            == "1"
        ):
            break
        if first.poll() is not None:
            raise SystemExit("First attendance request exited before synchronization.")
        time.sleep(0.03)
    else:
        first.terminate()
        raise SystemExit("Attendance synchronization point was not reached.")
    second = subprocess.run(
        command,
        input=second_sql,
        text=True,
        capture_output=True,
        env=environment,
        timeout=15,
    )
    first.wait(timeout=15)
    if first.returncode != 0:
        raise SystemExit("The first attendance request failed during contention.")
    return second


first_punch = (
    "select public.record_attendance('clock_in',"
    "'d7000000-0000-4000-8000-000000000001',null);commit;"
)
other_punch = (
    "select public.record_attendance('clock_in',"
    "'d7000000-0000-4000-8000-000000000002',null);commit;"
)
result = overlap(as_user(2) + first_punch, as_user(2) + other_punch)
if result.returncode == 0 or "PT409" not in result.stderr:
    raise SystemExit("Two distinct simultaneous punches must produce one stale-state denial.")
result = overlap(as_user(3) + first_punch, as_user(3) + first_punch)
if result.returncode != 0 or '"replayed": true' not in result.stdout:
    raise SystemExit("Identical simultaneous punches must replay one committed receipt.")
result = overlap(
    as_user(4) + first_punch,
    "update public.organization_memberships set active=false "
    "where user_id='d1000000-0000-4000-8000-000000000004';",
)
if result.returncode != 0:
    raise SystemExit("Membership revocation must serialize with an in-flight punch.")
result = subprocess.run(
    command,
    input=as_user(4) + other_punch,
    text=True,
    capture_output=True,
    env=environment,
    timeout=15,
)
if result.returncode == 0 or "PT403" not in result.stderr:
    raise SystemExit("A revoked account must fail after the in-flight punch finishes.")
result = overlap(
    as_user(5) + first_punch,
    as_user(1)
    + """select public.hr_save_employee(
      'd4000000-0000-4000-8000-000000000005',1,1,null,'Concurrent person 5','CONCURRENT-5',
      'd3000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001',
      'employee',true);commit;""",
)
if result.returncode == 0 or "PT409" not in result.stderr:
    raise SystemExit("Concurrent HR reassignment must reject an open session without deadlock.")
query("""
do $$ begin
 assert (select count(*) from public.attendance_events
  where organization_id='d2000000-0000-4000-8000-000000000001')=4;
 assert (select count(*) from public.audit_events
  where organization_id='d2000000-0000-4000-8000-000000000001'
  and action='attendance.clock_in')=4;
 assert (select site_id from public.employee_profiles
  where id='d4000000-0000-4000-8000-000000000005')='d3000000-0000-4000-8000-000000000001';
end $$;
drop trigger zzz_test_delay_attendance on public.attendance_events;
drop function snr_private.test_delay_attendance();
""")
print(
    "PASS: concurrent punches, keyed replay, revocation and HR reassignment "
    "preserve four events/audits without deadlock"
)
