// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalOrigin, generateSeo } from '../../scripts/generate-sitemap.mjs';
import { attendanceCsv } from '../services/exportService';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Public SEO generation', () => {
  it('uses only the configured HTTPS homepage and excludes private routes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snr-seo-'));
    directories.push(directory);
    await writeFile(join(directory, 'index.html'), '<html><head></head><body></body></html>');
    await generateSeo({ directory, siteUrl: 'https://workplace.example.org' });
    const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://workplace.example.org/</loc>');
    expect(sitemap.match(/<loc>/g) || []).toHaveLength(1);
    expect(sitemap).not.toMatch(/login|preview|localhost|\/hr/);
    expect(await readFile(join(directory, 'robots.txt'), 'utf8')).toContain(
      'Sitemap: https://workplace.example.org/sitemap.xml',
    );
    expect(await readFile(join(directory, 'index.html'), 'utf8')).toContain('rel="canonical"');
  });
  it('omits the sitemap when no production domain is configured, removing stale output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snr-seo-'));
    directories.push(directory);
    await writeFile(join(directory, 'sitemap.xml'), 'stale');
    expect(await generateSeo({ directory })).toBe(false);
    await expect(readFile(join(directory, 'sitemap.xml'))).rejects.toThrow();
    expect(await readFile(join(directory, 'robots.txt'), 'utf8')).not.toContain('Sitemap:');
  });
  it.each([
    'http://example.org',
    'https://localhost',
    'https://127.0.0.1',
    'https://site.invalid',
    'https://example.org/path',
    'https://user:password@example.org',
  ])('rejects invalid canonical setting %s', (value) => {
    expect(() => canonicalOrigin(value)).toThrow();
  });
});

it('exports labeled synthetic CSV and neutralizes formula cells', () => {
  const csv = attendanceCsv([
    {
      id: 'x',
      name: '=1+1',
      department: 'Team "A"',
      site: 'Site',
      status: 'Present',
      punch: '09:00',
    },
  ]);
  expect(csv).toContain('NOT OPERATIONAL DATA');
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('"Team ""A"""');
});
