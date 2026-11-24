import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const loadText = async (path) => readFile(new URL(path, root), "utf8");

test("compose.prod.yaml binds PostgreSQL strictly to internal network without host port mapping", async () => {
  const composeText = await loadText("compose.prod.yaml");
  assert.ok(composeText.includes("image: postgres:17-alpine"));
  // Ensure host port 5432 is NOT exposed
  assert.equal(
    composeText.includes("5432:5432"),
    false,
    "Port 5432 must not be exposed to host",
  );
  assert.ok(composeText.includes("backend-net"));
});

test("compose.prod.yaml includes container healthchecks for db and api services", async () => {
  const composeText = await loadText("compose.prod.yaml");
  assert.ok(composeText.includes("pg_isready"));
  assert.ok(composeText.includes("/api/v1/ready"));
});

test("infra/caddy/Caddyfile configures baseline browser security headers and API reverse proxy", async () => {
  const caddyfile = await loadText("infra/caddy/Caddyfile");
  assert.ok(caddyfile.includes("Strict-Transport-Security"));
  assert.ok(caddyfile.includes('X-Content-Type-Options "nosniff"'));
  assert.ok(caddyfile.includes('X-Frame-Options "DENY"'));
  assert.ok(caddyfile.includes("reverse_proxy api:8000"));
});

test("scripts/backup-db.sh enforces required variables and SSE-S3 AES256 encryption", async () => {
  const backupScript = await loadText("scripts/backup-db.sh");
  assert.ok(backupScript.includes("BACKUP_BUCKET"));
  assert.ok(backupScript.includes("sha256sum"));
  assert.ok(backupScript.includes("--sse AES256"));
});

test("scripts/server-setup.sh configures UFW to block port 5432 and allow only 80, 443, and 22", async () => {
  const setupScript = await loadText("scripts/server-setup.sh");
  assert.ok(setupScript.includes("ufw allow 80/tcp"));
  assert.ok(setupScript.includes("ufw allow 443/tcp"));
  assert.ok(setupScript.includes("ufw deny 5432/tcp"));
  assert.ok(setupScript.includes("snr-nest.service"));
});

test(".github/workflows/deploy-aws.yml uses OIDC and targeted CloudFront invalidations without blanket /*", async () => {
  const workflowText = await loadText(".github/workflows/deploy-aws.yml");
  assert.ok(workflowText.includes("aws-actions/configure-aws-credentials"));
  assert.ok(workflowText.includes("role-to-assume: ${{ vars.AWS_ROLE_ARN }}"));
  assert.equal(
    workflowText.includes("/*"),
    false,
    "Blanket invalidation /* is strictly prohibited",
  );
  assert.ok(
    workflowText.includes('"/index.html" "/sw.js" "/manifest.webmanifest"'),
  );
  assert.equal(
    workflowText.includes("AWS_SECRET_ACCESS_KEY"),
    false,
    "Static AWS keys are strictly prohibited",
  );
});

test("production deployment waits for successful main CI and deploys through OIDC", async () => {
  const workflowText = await loadText(
    ".github/workflows/deploy-production-aws.yml",
  );
  assert.ok(workflowText.includes("workflow_run:"));
  assert.ok(
    workflowText.includes("github.event.workflow_run.conclusion == 'success'"),
  );
  assert.ok(
    workflowText.includes("github.event.workflow_run.head_branch == 'main'"),
  );
  assert.ok(workflowText.includes("environment: production"));
  assert.ok(workflowText.includes("aws-actions/configure-aws-credentials"));
  assert.ok(workflowText.includes("create-application-version"));
  assert.ok(workflowText.includes("update-environment"));
  assert.ok(workflowText.includes("environment-updated"));
  assert.ok(workflowText.includes("https://api.snrnest.in/api/v1/ready"));
  assert.equal(workflowText.includes("AWS_SECRET_ACCESS_KEY"), false);
  assert.equal(workflowText.includes('"/*"'), false);
});

test("Elastic Beanstalk bundle migrates and bootstraps before starting the API", async () => {
  const composeText = await loadText(
    "infra/aws/elasticbeanstalk/docker-compose.yml",
  );
  assert.ok(composeText.includes('command: ["alembic", "upgrade", "head"]'));
  assert.ok(composeText.includes("bootstrap-admin:"));
  assert.ok(composeText.includes("scripts/bootstrap_production_admin.py"));
  assert.ok(composeText.includes("condition: service_completed_successfully"));
  assert.ok(composeText.includes('SESSION_COOKIE_SECURE: "true"'));
  assert.ok(composeText.includes("headers={'Host': 'api.snrnest.in'}"));
  assert.equal(composeText.includes("POSTGRES_PASSWORD"), false);
});

test("production administrator bootstrap does not contain a default password", async () => {
  const bootstrap = await loadText(
    "backend/scripts/bootstrap_production_admin.py",
  );
  assert.ok(bootstrap.includes("SNR_BOOTSTRAP_ADMIN_PASSWORD"));
  assert.ok(bootstrap.includes("len(password) < 20"));
  assert.equal(bootstrap.includes("test-seed-password"), false);
  assert.equal(bootstrap.includes("print(password"), false);
});

test("employee provisioning uses a cryptographically random temporary password", async () => {
  const workforce = await loadText("backend/app/services/workforce.py");
  assert.ok(workforce.includes("secrets.token_urlsafe(24)"));
  assert.equal(workforce.includes('f"SNR@{clean_code}"'), false);
});
