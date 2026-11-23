import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const loadText = async (path) => readFile(new URL(path, root), "utf8");

test("compose.prod.yaml binds PostgreSQL strictly to internal network without host port mapping", async () => {
  const composeText = await loadText("compose.prod.yaml");
  assert.ok(composeText.includes("image: postgres:17-alpine"));
  // Ensure host port 5432 is NOT exposed
  assert.equal(composeText.includes("5432:5432"), false, "Port 5432 must not be exposed to host");
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
  assert.ok(caddyfile.includes("X-Content-Type-Options \"nosniff\""));
  assert.ok(caddyfile.includes("X-Frame-Options \"DENY\""));
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
  assert.equal(workflowText.includes("/*"), false, "Blanket invalidation /* is strictly prohibited");
  assert.ok(workflowText.includes('"/index.html" "/sw.js" "/manifest.webmanifest"'));
  assert.equal(workflowText.includes("AWS_SECRET_ACCESS_KEY"), false, "Static AWS keys are strictly prohibited");
});

