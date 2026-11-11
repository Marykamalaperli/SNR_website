"""Disposable Docker PostgreSQL only: personal QR preflight versus HR revocation."""

import os
import subprocess
import sys
import time

container = sys.argv[1]
docker_env = {
    key: value
    for key, value in os.environ.items()
    if key
    not in {"DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"}
}
command = [
    "docker",
    "--host=unix:///var/run/docker.sock",
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
]


def query(sql):
    return subprocess.run(
        command, input=sql, text=True, capture_output=True, env=docker_env, timeout=15, check=True
    ).stdout.strip()


employee = "e1000000-0000-4000-8000-000000000004"
organization = "e2000000-0000-4000-8000-000000000001"
qr = query(
    "set role authenticated; set request.jwt.claims="
    '\'{"sub":"e1000000-0000-4000-8000-000000000001"}\';'
    "select public.hr_employee_attendance_qr('e4000000-0000-4000-8000-000000000004')->>'token';"
)
assert len(qr) == 36
# Wait until the holder really acquired the lock; no timing assumption about startup.
holder = subprocess.Popen(
    command,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=docker_env,
)
holder.stdin.write(
    f"begin; select pg_advisory_xact_lock(hashtextextended('workforce-people:{organization}',0));\n"
)
holder.stdin.write("select 'LOCKED';\n")
holder.stdin.flush()
assert holder.stdout.readline().strip() == ""
assert holder.stdout.readline().strip() == "LOCKED"
waiter = subprocess.Popen(
    command,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=docker_env,
)
waiter.stdin.write(
    "set statement_timeout='8s'; set role authenticated;"
    f'set request.jwt.claims=\'{{"sub":"{employee}"}}\';'
    f"select public.employee_qr_attendance_workspace('{qr}');\n"
)
waiter.stdin.close()
time.sleep(0.3)
# A preflight that took a membership share lock before waiting on the people lock
# would deadlock this update. Revocation must commit, and then deny the waiter.
holder.stdin.write(
    f"update public.organization_memberships set active=false where user_id='{employee}'; commit;\n"
)
holder.stdin.close()
assert holder.wait(timeout=12) == 0, "HR revocation deadlocked with QR preflight"
assert waiter.wait(timeout=12) != 0, "Revoked employee retained QR access"
assert "workforce_access_denied" in waiter.stderr.read(), "Unexpected preflight failure"
query(f"update public.organization_memberships set active=true where user_id='{employee}';")
print("PASS: personal QR preflight serializes before membership locks and observes HR revocation")
