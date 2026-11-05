#!/usr/bin/env bash
# Run from an authenticated, operator-selected Google Cloud account. No IAM grants
# or live database changes are performed by this script.
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

for variable in GCP_PROJECT_ID GCP_REGION GCP_ARTIFACT_REPOSITORY GCP_SERVICE GCP_BUILD_SERVICE_ACCOUNT GCP_RUNTIME_SERVICE_ACCOUNT PUBLIC_SITE_URL; do
  if [ -z "${!variable:-}" ]; then
    printf 'Required deployment setting is missing: %s\n' "$variable" >&2
    exit 1
  fi
done

cors_origins="$(python3 - <<'PY'
import json, os
from urllib.parse import urlsplit
value = os.environ['PUBLIC_SITE_URL']
origin = urlsplit(value)
if origin.scheme != 'https' or not origin.hostname or origin.path not in ('', '/') or origin.username or origin.password or origin.port or origin.query or origin.fragment:
    raise SystemExit('PUBLIC_SITE_URL must be the actual public HTTPS origin.')
print(json.dumps([f'https://{origin.hostname}'], separators=(',', ':')))
PY
)"
release_tag="${GITHUB_SHA:-$(git rev-parse --verify HEAD)}"
if [[ ! "$release_tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Deploy an exact committed Git SHA.' >&2
  exit 1
fi

repository_format="$(gcloud artifacts repositories describe "$GCP_ARTIFACT_REPOSITORY" --project="$GCP_PROJECT_ID" --location="$GCP_REGION" --format='value(format)')"
if [ "$repository_format" != 'DOCKER' ]; then
  echo 'The selected Artifact Registry repository must already exist and use Docker format.' >&2
  exit 1
fi

# Project/region are always explicit. A colliding service belonging to another app
# must not be overwritten. Listing errors fail instead of masquerading as not found.
existing_services="$(gcloud run services list --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --platform=managed --filter="metadata.name=$GCP_SERVICE" --format='json(metadata.name,metadata.labels.app,status.url)')"
existing_url="$(EXISTING_SERVICES="$existing_services" python3 - <<'PY'
import json, os
services = json.loads(os.environ['EXISTING_SERVICES'])
if len(services) > 1:
    raise SystemExit('Service selection is ambiguous.')
if services and services[0].get('metadata', {}).get('labels', {}).get('app') != 'snr-nest':
    raise SystemExit('Refusing to replace an existing service without the app=snr-nest label.')
print(services[0].get('status', {}).get('url', '') if services else '')
PY
)"
image_base="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$GCP_ARTIFACT_REPOSITORY/$GCP_SERVICE"
image="$image_base:$release_tag"
gcloud builds submit . --quiet --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --service-account="projects/$GCP_PROJECT_ID/serviceAccounts/$GCP_BUILD_SERVICE_ACCOUNT" \
  --config=infra/cloud-run/cloudbuild.yaml --substitutions="_IMAGE=$image"
digest="$(gcloud artifacts docker images describe "$image" --project="$GCP_PROJECT_ID" --format='value(image_summary.digest)')"
if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo 'Artifact Registry did not return a verified image digest.' >&2
  exit 1
fi

updates="^|^APP_ENV=production|CORS_ORIGINS=$cors_origins"
if [ -z "$existing_url" ]; then
  # First revision starts with TCP liveness and denies unknown HTTP hosts. After
  # Cloud Run returns its actual URL, a second revision installs that exact host.
  updates="$updates|ALLOWED_HOSTS=[\"localhost\"]"
fi
gcloud run deploy "$GCP_SERVICE" --quiet --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="$image_base@$digest" --service-account="$GCP_RUNTIME_SERVICE_ACCOUNT" \
  --port=8080 --cpu=1 --memory=256Mi --concurrency=40 --timeout=30 \
  --min-instances=0 --max-instances=1 --allow-unauthenticated \
  --labels=app=snr-nest --update-env-vars="$updates"
service_url="$(gcloud run services describe "$GCP_SERVICE" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)')"
allowed_hosts="$(SERVICE_URL="$service_url" python3 - <<'PY'
import json, os
from urllib.parse import urlsplit
url = urlsplit(os.environ['SERVICE_URL'])
if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.run.app'):
    raise SystemExit('Cloud Run did not return a valid HTTPS service URL.')
print(json.dumps([url.hostname]))
PY
)"
gcloud run services update "$GCP_SERVICE" --quiet --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --update-env-vars="^|^ALLOWED_HOSTS=$allowed_hosts"
curl --fail --silent --show-error --retry 5 --retry-delay 3 "$service_url/health" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("status")=="ok" and data.get("service")=="snr-nest-api"'
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'url=%s\n' "$service_url" >> "$GITHUB_OUTPUT"
fi
printf 'Verified Cloud Run API: %s\n' "$service_url"
