import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensurePagesProject } from "./ensure-pages-project.mjs";

const config = {
  accountId: "0".repeat(32),
  token: "test-only-not-a-credential",
  projectName: "unit-test-project",
};
const project = {
  production_branch: "main",
  subdomain: "unit-test-project.pages.dev",
  domains: ["workplace.example.org"],
};
const reply = (status, result) =>
  new Response(JSON.stringify({ success: status < 400, result }), { status });

test("missing Cloudflare access fails before any cloud request", async () => {
  let called = false;
  await assert.rejects(
    ensurePagesProject({
      request: () => {
        called = true;
      },
    }),
    /Configure CLOUDFLARE/,
  );
  assert.equal(called, false);
});

test("an existing Pages project supplies its real canonical origin without writes", async () => {
  const calls = [];
  const origin = await ensurePagesProject({
    ...config,
    request: async (url, options) => {
      calls.push([url, options.method || "GET"]);
      return reply(200, project);
    },
  });
  assert.equal(origin, "https://unit-test-project.pages.dev");
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["GET"],
  );
});

test("only a verified not-found response causes project creation on main", async () => {
  const calls = [];
  const origin = await ensurePagesProject({
    ...config,
    request: async (_url, options) => {
      calls.push(options);
      return calls.length === 1 ? reply(404, null) : reply(200, project);
    },
  });
  assert.equal(origin, "https://unit-test-project.pages.dev");
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1].body), {
    name: config.projectName,
    production_branch: "main",
  });
});

for (const status of [401, 403, 500]) {
  test(`Cloudflare ${status} is never interpreted as permission to create a project`, async () => {
    let calls = 0;
    await assert.rejects(
      ensurePagesProject({
        ...config,
        request: async () => {
          calls++;
          return reply(status, null);
        },
      }),
      new RegExp(`failed \\(${status}\\)`),
    );
    assert.equal(calls, 1);
  });
}

test("an existing different production branch is preserved and rejected", async () => {
  await assert.rejects(
    ensurePagesProject({
      ...config,
      request: async () =>
        reply(200, { ...project, production_branch: "another-branch" }),
    }),
    /does not use main/,
  );
});

test("canonical override must be HTTPS and belong to this Pages project", async () => {
  for (const siteUrl of [
    "http://workplace.example.org",
    "https://unregistered.example.org",
    "https://workplace.example.org/path",
  ]) {
    await assert.rejects(
      ensurePagesProject({
        ...config,
        siteUrl,
        request: async () => reply(200, project),
      }),
    );
  }
  assert.equal(
    await ensurePagesProject({
      ...config,
      siteUrl: "https://workplace.example.org",
      request: async () => reply(200, project),
    }),
    "https://workplace.example.org",
  );
});

test("Cloud Build upload rules exclude credentials, caches, UI and unrelated files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snr-build-context-"));
  const expected = [
    "backend/app/main.py",
    "backend/requirements-runtime.txt",
    "backend/requirements.lock",
    "infra/cloud-run/Dockerfile",
    "infra/cloud-run/cloudbuild.yaml",
  ];
  try {
    execFileSync("git", ["init", "--quiet", directory]);
    await writeFile(
      join(directory, ".gitignore"),
      await readFile(new URL("../.gcloudignore", import.meta.url)),
    );
    for (const file of [
      ...expected,
      "backend/.env",
      "backend/app/.env",
      "backend/app/__pycache__/main.pyc",
      "frontend/.env",
      "frontend/src/main.jsx",
      "gha-creds-test.json",
      "unrelated-notes.txt",
    ]) {
      await mkdir(dirname(join(directory, file)), { recursive: true });
      await writeFile(join(directory, file), "test fixture");
    }
    const included = execFileSync(
      "git",
      ["-C", directory, "ls-files", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(included, expected.sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
