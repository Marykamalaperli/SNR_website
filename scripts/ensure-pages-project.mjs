import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function ensurePagesProject({
  accountId,
  token,
  projectName = "snr-nest",
  siteUrl = "",
  request = fetch,
}) {
  if (!accountId || !token)
    throw new Error(
      "Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN securely before deploying.",
    );
  if (!/^[a-f0-9]{32}$/i.test(accountId))
    throw new Error("Invalid Cloudflare account ID.");
  if (!/^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/.test(projectName))
    throw new Error("Invalid Pages project name.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  async function read(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload.result) {
      // Do not echo upstream bodies: they can include account or credential details.
      throw new Error(
        `Cloudflare project request failed (${response.status}). Check account access and Pages permissions.`,
      );
    }
    return payload.result;
  }
  let response = await request(`${base}/${projectName}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  let project;
  if (response.status === 404) {
    response = await request(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: projectName, production_branch: "main" }),
      signal: AbortSignal.timeout(15000),
    });
    project = await read(response);
  } else {
    project = await read(response);
  }
  if (project.production_branch !== "main")
    throw new Error(
      "The existing Pages project does not use main as its production branch. Review it before deploying.",
    );
  if (!project.subdomain?.endsWith(".pages.dev"))
    throw new Error("Cloudflare did not return a valid Pages hostname.");
  const origin = new URL(siteUrl || `https://${project.subdomain}`);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.port ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("PUBLIC_SITE_URL must be a public HTTPS origin.");
  }
  if (
    ![project.subdomain, ...(project.domains || [])].includes(origin.hostname)
  ) {
    throw new Error(
      "The canonical domain is not registered on this Pages project. Configure it in Cloudflare first.",
    );
  }
  return origin.origin;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const siteUrl = await ensurePagesProject({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      projectName: process.env.CLOUDFLARE_PAGES_PROJECT || "snr-nest",
      siteUrl: process.env.PUBLIC_SITE_URL,
    });
    if (process.env.GITHUB_OUTPUT) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_OUTPUT, `site_url=${siteUrl}\n`);
    }
    console.log(`Verified Pages origin: ${siteUrl}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
