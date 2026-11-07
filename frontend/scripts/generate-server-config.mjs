import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { readPublicAuthConfig } from './public-auth-config.mjs';

// Public build inputs only. Secrets are runtime Cloudflare bindings, never read here.
const config = readPublicAuthConfig(loadEnv('production', process.cwd(), 'VITE_'), {
  production: true,
});
await mkdir('.server-generated', { recursive: true });
await writeFile(
  '.server-generated/public-config.js',
  `// Generated from public build settings. Never edit or commit.\nexport default ${JSON.stringify({ supabaseUrl: config.supabaseUrl, supabaseKey: config.supabaseKey })};\n`,
);
console.log('Prepared public configuration for server functions.');
