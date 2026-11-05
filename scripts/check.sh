#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node --test "$project_root/scripts/deployment.test.mjs"
bash -n "$project_root/scripts/deploy-cloud-run.sh"
cd "$project_root/frontend"
npm run format:check
npm run lint
npm run test
npm run build
cd "$project_root/backend"
.venv/bin/python -m ruff check .
.venv/bin/python -m ruff format --check .
.venv/bin/python -m pytest
