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
  if snr_docker exec "$snr_pg_container" pg_isready --username=postgres >/dev/null 2>&1; then break; fi
  if [ "$snr_attempt" = 30 ]; then echo 'Test PostgreSQL did not become ready.' >&2; exit 1; fi
  sleep 1
done
snr_psql() {
  snr_docker exec --interactive "$snr_pg_container" psql --username=postgres --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}
snr_psql < "$snr_project_root/supabase/tests/bootstrap.sql"
snr_psql < "$snr_project_root/supabase/migrations/202611050001_foundation.sql"
snr_psql < "$snr_project_root/supabase/migrations/202611050002_auth_session.sql"
python3 - "$snr_project_root" <<'PY' | snr_psql
from pathlib import Path
import sys
root = Path(sys.argv[1])
first = (root / 'supabase/setup/first-administrator.sql').read_text()
first = first.replace("administrator_email text := 'REPLACE_WITH_YOUR_CONFIRMED_EMAIL'", "administrator_email text := 'setup-admin@example.invalid'", 1)
assign = (root / 'supabase/setup/assign-workspace.sql').read_text()
assign = assign.replace('target_organization uuid := null;', 'target_organization uuid := (select id from public.organizations);', 1)
assign = assign.replace("target_email text := 'REPLACE_WITH_CONFIRMED_EMAIL'", "target_email text := 'setup-employee@example.invalid'", 1)
print("begin; insert into auth.users values ('90000000-0000-4000-8000-000000000001','setup-admin@example.invalid',now()),('90000000-0000-4000-8000-000000000002','setup-employee@example.invalid',now());")
for query in (first, assign):
    print(query.replace('\nbegin;\n', '\n').replace('\ncommit;\n', '\n'))
print("do $$ begin assert (select count(*) from public.organizations)=1; assert (select role from public.organization_memberships where user_id='90000000-0000-4000-8000-000000000001')='hr'; assert (select role from public.organization_memberships where user_id='90000000-0000-4000-8000-000000000002')='employee'; end $$; rollback;")
PY
echo 'PASS: owner-only administrator and employee provisioning queries'
snr_psql < "$snr_project_root/supabase/tests/authorization.sql"
