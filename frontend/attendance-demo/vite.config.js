import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = fileURLToPath(new URL('../attendance-demo-dist', import.meta.url));
export default defineConfig({
  root,
  base: './',
  publicDir: false,
  envPrefix: 'DEMO_PUBLIC_',
  plugins: [
    react(),
    {
      name: 'isolated-review-headers',
      closeBundle() {
        copyFileSync(root + '_headers', output + '/_headers');
        writeFileSync(output + '/robots.txt', 'User-agent: *\nDisallow: /\n');
        mkdirSync(output + '/licenses', { recursive: true });
        for (const font of ['manrope', 'dm-sans']) {
          copyFileSync(
            fileURLToPath(
              new URL('../node_modules/@fontsource/' + font + '/LICENSE', import.meta.url),
            ),
            output + '/licenses/' + font + '.txt',
          );
        }
      },
    },
  ],
  build: { outDir: output, emptyOutDir: true, license: true },
});
