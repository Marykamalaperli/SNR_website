#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-${repo_root}/snrnest-elastic-beanstalk.zip}"
staging_dir="$(mktemp -d)"
trap 'rm -rf "${staging_dir}"' EXIT

mkdir -p "${staging_dir}/backend" "${staging_dir}/infra/aws" "${staging_dir}/infra/docker" "${staging_dir}/infra/caddy"
cp -R "${repo_root}/backend/app" "${repo_root}/backend/alembic" "${repo_root}/backend/scripts" "${staging_dir}/backend/"
cp "${repo_root}/backend/alembic.ini" "${repo_root}/backend/requirements-runtime.txt" "${repo_root}/backend/requirements.lock" "${staging_dir}/backend/"
cp "${repo_root}/infra/docker/backend.Dockerfile" "${staging_dir}/infra/docker/"
cp "${repo_root}/infra/caddy/Caddyfile" "${staging_dir}/infra/caddy/"
cp "${repo_root}/infra/aws/elasticbeanstalk/docker-compose.yml" "${staging_dir}/docker-compose.yml"

(cd "${staging_dir}" && zip -qr "${output_path}" .)
printf 'Created %s\n' "${output_path}"
