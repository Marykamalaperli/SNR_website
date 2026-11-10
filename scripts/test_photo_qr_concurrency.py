"""Real overlapping HR site-save and QR/photo punch; disposable DB only."""

import os
import re
import subprocess
import sys
import time
from pathlib import Path

container = sys.argv[1]
if not re.fullmatch(r"[a-f0-9]{12,64}", container):
    raise SystemExit("Pass the disposable test container ID.")
environment = os.environ.copy()
for name in (
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
):
    environment.pop(name, None)
command = [
    "docker",
    "--host=unix:///var/run/docker.sock",
    "exec",
    "--interactive",
    container,
    "psql",
    "--username=postgres",
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=sqlstate",
]


def query(sql):
    return subprocess.run(
        command, input=sql, text=True, capture_output=True, env=environment, timeout=15, check=True
    ).stdout.strip()


def caller(number):
    return (
        "begin;set role authenticated;select set_config('request.jwt.claims',"
        f"""'{{"sub":"e1000000-0000-4000-8000-{number:012d}"}}',true);"""
    )


site = "'e3000000-0000-4000-8000-000000000001'"
query(
    caller(1)
    + f"select public.hr_save_site_attendance_area({site},null,12.971599,77.594566,100);"
    + f"select public.hr_attendance_qr({site});commit;"
)
version = query(f"select version from public.sites where id={site};")
area_version = query(f"select version from snr_private.site_attendance_areas where site_id={site};")
previous = query(
    "select id from public.attendance_events where employee_id="
    "'e4000000-0000-4000-8000-000000000004' order by sequence_no desc limit 1;"
)
qr = query(
    f"select 'snr-attendance:v1:'||site_id||':'||token "
    f"from snr_private.site_attendance_qr where site_id={site};"
)
fixture = (Path(__file__).parents[1] / "supabase/tests/attendance-photo-qr.sql").read_text()
photo = re.search(r"'jpeg_base64','([A-Za-z0-9+/=]+)'", fixture).group(1)
query("""
create function snr_private.test_delay_photo_site() returns trigger language plpgsql as $$
begin perform pg_sleep(0.8);return new;end $$;
create trigger zzz_test_delay_photo_site after update on public.sites for each row
 when (new.id='e3000000-0000-4000-8000-000000000001')
 execute function snr_private.test_delay_photo_site();
""")
first = subprocess.Popen(
    command,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=environment,
)
first.stdin.write(
    "set application_name='snr-photo-site-first';"
    + caller(1)
    + f"select public.hr_save_attendance_site({site},{version},'Updated store','UTC',"
    + f"12.971599,77.594566,100,{area_version});commit;"
)
first.stdin.close()
deadline = time.monotonic() + 6
while time.monotonic() < deadline:
    if (
        query(
            "select count(*) from pg_stat_activity where "
            "application_name='snr-photo-site-first' and wait_event='PgSleep';"
        )
        == "1"
    ):
        break
    if first.poll() is not None:
        raise SystemExit("Site save exited before the synchronization point.")
    time.sleep(0.03)
else:
    raise SystemExit("Site save did not reach the synchronization point.")

query(
    caller(4)
    + f"""
select public.record_attendance('clock_in','eb000000-0000-4000-8000-000000000001','{previous}',
 jsonb_build_object('latitude',12.971599,'longitude',77.594566,'accuracy_meters',8,
 'captured_at',clock_timestamp(),'consent_version','attendance-location-v1'),
 'e4000000-0000-4000-8000-000000000004',
 jsonb_build_object('qr','{qr}','photo',jsonb_build_object('jpeg_base64','{photo}',
 'captured_at',clock_timestamp(),'consent_version','attendance-photo-location-v1')));
commit;
"""
)
first.wait(timeout=15)
if first.returncode != 0:
    raise SystemExit("The concurrent HR save failed: " + first.stderr.read())
query(f"""
do $$ begin
 assert (select count(*) from public.attendance_events
  where idempotency_key='eb000000-0000-4000-8000-000000000001')=1;
 assert (select count(*) from snr_private.attendance_evidence p join public.attendance_events e
  on e.id=p.event_id where e.idempotency_key='eb000000-0000-4000-8000-000000000001')=1;
 assert (select store_policy_version from snr_private.attendance_locations l
  join public.attendance_events e on e.id=l.event_id
  where e.idempotency_key='eb000000-0000-4000-8000-000000000001')={int(area_version) + 1};
end $$;
drop trigger zzz_test_delay_photo_site on public.sites;
drop function snr_private.test_delay_photo_site();
""")
print("PASS: concurrent atomic HR site edit and QR/photo punch preserve evidence without deadlock")
