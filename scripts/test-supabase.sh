#!/usr/bin/env bash
# Disposable local database only. No customer database URL or keys are accepted.
set -euo pipefail
snr_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
snr_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
snr_pg_password="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
snr_pg_container="$(POSTGRES_PASSWORD="$snr_pg_password" snr_docker run --detach --rm --network none --env POSTGRES_PASSWORD postgres:16-alpine)"
trap 'snr_docker rm --force "$snr_pg_container" >/dev/null' EXIT
for snr_attempt in $(seq 1 30); do
  # TCP is enabled only by the final server, after the image's temporary init server exits.
  if snr_docker exec "$snr_pg_container" pg_isready --host=127.0.0.1 --username=postgres >/dev/null 2>&1; then break; fi
  if [ "$snr_attempt" = 30 ]; then echo 'Test PostgreSQL did not become ready.' >&2; exit 1; fi
  sleep 1
done
snr_psql() {
  snr_docker exec --interactive "$snr_pg_container" psql --username=postgres --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}
snr_psql < "$snr_project_root/supabase/tests/bootstrap.sql"
for snr_migration in "$snr_project_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$snr_migration")" < '202611070006' ]]; then snr_psql < "$snr_migration"; fi
done
python3 - "$snr_project_root" <<'PY' | snr_psql
from pathlib import Path
import sys
root = Path(sys.argv[1])
first = (root / 'supabase/setup/first-administrator.sql').read_text()
first = first.replace("administrator_email text := 'REPLACE_WITH_YOUR_CONFIRMED_EMAIL'", "administrator_email text := 'setup-admin@example.invalid'", 1)
assign = (root / 'supabase/setup/assign-workspace.sql').read_text()
assign = assign.replace('target_organization uuid := null;', 'target_organization uuid := (select id from public.organizations);', 1)
assign = assign.replace("target_email text := 'REPLACE_WITH_CONFIRMED_EMAIL'", "target_email text := 'setup-employee@example.invalid'", 1)
print("begin; insert into auth.users(id,email,email_confirmed_at) values ('90000000-0000-4000-8000-000000000001','setup-admin@example.invalid',now()),('90000000-0000-4000-8000-000000000002','setup-employee@example.invalid',now());")
for query in (first, assign):
    print(query.replace('\nbegin;\n', '\n').replace('\ncommit;\n', '\n'))
print("do $$ begin assert (select count(*) from public.organizations)=1; assert (select role from public.organization_memberships where user_id='90000000-0000-4000-8000-000000000001')='hr'; assert (select role from public.organization_memberships where user_id='90000000-0000-4000-8000-000000000002')='employee'; end $$; rollback;")
PY
echo 'PASS: owner-only administrator and employee provisioning queries'
snr_psql < "$snr_project_root/supabase/tests/authorization.sql"
snr_psql < "$snr_project_root/supabase/tests/workforce.sql"
snr_psql < "$snr_project_root/supabase/tests/dashboard-accounts.sql"
snr_psql < "$snr_project_root/supabase/tests/attendance.sql"
snr_psql < "$snr_project_root/supabase/tests/location-upgrade.sql"
for snr_migration in "$snr_project_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$snr_migration")" == '202611070006_attendance_locations.sql' ]]; then snr_psql < "$snr_migration"; fi
done
snr_psql < "$snr_project_root/supabase/tests/attendance-locations.sql"
snr_psql < "$snr_project_root/supabase/tests/store-area-upgrade.sql"
for snr_migration in "$snr_project_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$snr_migration")" == '202611080007_store_attendance_areas.sql' ]]; then snr_psql < "$snr_migration"; fi
done
snr_psql < "$snr_project_root/supabase/tests/store-attendance-areas.sql"
python3 "$snr_project_root/scripts/test_workspace_concurrency.py" "$snr_pg_container"
snr_psql < "$snr_project_root/supabase/migrations/202611100008_attendance_photo_qr.sql"
snr_psql < "$snr_project_root/supabase/tests/attendance-photo-qr.sql"
python3 "$snr_project_root/scripts/test_photo_qr_concurrency.py" "$snr_pg_container"

snr_psql < "$snr_project_root/supabase/tests/storage-bootstrap.sql"
snr_psql < "$snr_project_root/supabase/migrations/202611110009_attendance_storage_location.sql"
snr_psql < "$snr_project_root/supabase/tests/attendance-storage.sql"

snr_psql < "$snr_project_root/supabase/migrations/202611110010_attendance_location_photo_only.sql"
snr_psql < "$snr_project_root/supabase/tests/attendance-photo-only.sql"

snr_psql < "$snr_project_root/supabase/tests/photo-name-upgrade.sql"
snr_psql < "$snr_project_root/supabase/migrations/202611110011_attendance_photo_names.sql"
snr_psql < "$snr_project_root/supabase/tests/attendance-photo-names.sql"

snr_psql < "$snr_project_root/supabase/migrations/202611110012_employee_attendance_qr.sql"
snr_psql < "$snr_project_root/supabase/tests/employee-attendance-qr.sql"
python3 "$snr_project_root/scripts/test_employee_qr_concurrency.py" "$snr_pg_container"

snr_psql < "$snr_project_root/supabase/migrations/202611110013_employee_qr_attendance_access.sql"
snr_psql < "$snr_project_root/supabase/tests/employee-qr-attendance-access.sql"

snr_attendance_readiness="$(snr_psql --tuples-only --no-align --field-separator=, < "$snr_project_root/supabase/setup/check-security-attendance.sql")"
test "$snr_attendance_readiness" = 't,f,f,f'

# A leftover helper must be reported as partial, not treated as an absent 0014.
# The synthetic probe is rolled back before normal migration/permission tests.
snr_partial_readiness="$(
  {
    cat <<'SQL'
begin;
create function snr_private.security_employee() returns public.employee_profiles
language sql set search_path='' as $$ select null::public.employee_profiles $$;
SQL
    cat "$snr_project_root/supabase/setup/check-attendance-migrations.sql"
    printf '%s\n' 'rollback;'
  } | snr_psql --quiet --tuples-only --no-align --field-separator=,
)"
case "$snr_partial_readiness" in
  *'0014,f,partial_inspect_before_applying'*) ;;
  *) echo 'Partial attendance setup was not detected.' >&2; exit 1 ;;
esac

snr_psql < "$snr_project_root/supabase/migrations/202611130014_security_attendance.sql"
snr_psql < "$snr_project_root/supabase/tests/security-attendance.sql"

snr_attendance_readiness="$(snr_psql --tuples-only --no-align --field-separator=, < "$snr_project_root/supabase/setup/check-security-attendance.sql")"
test "$snr_attendance_readiness" = 't,t,f,t'

snr_psql < "$snr_project_root/supabase/migrations/202611140015_supervised_attendance.sql"
snr_psql < "$snr_project_root/supabase/tests/supervised-attendance.sql"

snr_attendance_readiness="$(snr_psql --tuples-only --no-align --field-separator=, < "$snr_project_root/supabase/setup/check-security-attendance.sql")"
test "$snr_attendance_readiness" = 't,t,t,t'
snr_psql < "$snr_project_root/supabase/setup/check-attendance-migrations.sql"
snr_psql < "$snr_project_root/supabase/setup/inspect-security-attendance.sql"
echo 'PASS: read-only attendance readiness detects missing setup before 0014 and installed objects/grants after 0015'

# A repeated migration can fail at its first duplicate even when setup succeeded
# earlier. PostgreSQL must roll that attempt back with definitions/grants intact.
snr_security_definitions() {
  snr_psql --quiet --tuples-only --no-align --command="select md5(string_agg(p.oid::text||':'||p.proowner::text||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(p.proacl::text,''),E'\\n' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','snr_private') and p.prokind='f';"
}
snr_before_retry="$(snr_security_definitions)"
for snr_migration in 202611130014_security_attendance.sql 202611140015_supervised_attendance.sql; do
  if snr_retry_error="$(snr_psql --set=VERBOSITY=verbose < "$snr_project_root/supabase/migrations/$snr_migration" 2>&1)"; then
    echo 'A previously applied attendance migration unexpectedly succeeded twice.' >&2
    exit 1
  fi
  case "$snr_retry_error" in
    *'42723'*'already exists'*) ;;
    *) printf '%s\n' "$snr_retry_error" >&2; exit 1 ;;
  esac
  test "$(snr_security_definitions)" = "$snr_before_retry"
done
echo 'PASS: duplicate 0014/0015 attempts roll back without altering installed function definitions or grants'
