import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

export function canonicalOrigin(value) {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.port ||
    !url.hostname.includes('.') ||
    /(^localhost$|\.localhost$|\.local$|\.invalid$|^\d+\.\d+\.\d+\.\d+$|:)/i.test(url.hostname)
  )
    throw new Error(
      'PUBLIC_SITE_URL must be the actual public HTTPS origin, without a path or port.',
    );
  return url.origin;
}

export async function generateSeo({ directory = 'dist', siteUrl = '' } = {}) {
  const origin = canonicalOrigin(siteUrl);
  await rm(resolve(directory, 'sitemap.xml'), { force: true });
  const robots = `User-agent: *\nAllow: /\n${['login', 'me', 'team', 'hr', 'preview', 'api'].map((path) => `Disallow: /${path}`).join('\n')}\n`;
  await writeFile(
    resolve(directory, 'robots.txt'),
    robots + (origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''),
  );
  if (!origin) return false;
  // Only the existing, publicly indexable homepage belongs in the sitemap.
  await writeFile(
    resolve(directory, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`,
  );
  const file = resolve(directory, 'index.html');
  const html = await readFile(file, 'utf8');
  await writeFile(
    file,
    html.replace(
      '</head>',
      `<link rel="canonical" href="${origin}/" /><meta property="og:url" content="${origin}/" /><meta name="snr-site-origin" content="${origin}" /></head>`,
    ),
  );
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = loadEnv('production', process.cwd(), 'PUBLIC_');
  const generated = await generateSeo({
    siteUrl: process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || '',
  });
  console.log(
    generated
      ? 'Public sitemap and canonical metadata generated.'
      : 'PUBLIC_SITE_URL not configured; sitemap and canonical URL omitted.',
  );
}
