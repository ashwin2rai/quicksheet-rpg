#!/usr/bin/env node
// Static smoke checks for GitHub Pages deployment: every local reference in
// index.html resolves, URLs are relative (so /<repo>/ project paths work), and
// runtime code makes no off-site requests.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, attr, url] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
  if (/^https:\/\//.test(url)) {
    if (attr === 'src') errors.push(`index.html loads a remote resource: ${url}`);
    continue; // outbound links (license, SRD) are fine
  }
  if (url.startsWith('/')) errors.push(`index.html uses a root-absolute URL (breaks GitHub Pages project paths): ${url}`);
  else if (!existsSync(join(ROOT, url))) errors.push(`index.html references a missing file: ${url}`);
}
if (/<link[^>]+href="https?:/.test(html)) errors.push('index.html links a remote stylesheet');

const srcDir = join(ROOT, 'src');
for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
  const code = readFileSync(join(srcDir, file), 'utf8');
  if (/Math\.random\s*\(/.test(code) && file !== 'rng.js') errors.push(`src/${file} calls Math.random(); use the injected rng`);
  if (/fetch\(\s*['"`]https?:/.test(code)) errors.push(`src/${file} fetches a remote URL`);
  if (/\bimport\b[^;]*from\s+['"]https?:/.test(code)) errors.push(`src/${file} imports a remote module`);
  if (/fetch\(\s*['"`]\//.test(code)) errors.push(`src/${file} fetches a root-absolute URL`);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'data/manifest.json'), 'utf8'));
const paths = [...Object.values(manifest.profiles).flatMap((p) => Object.values(p.files)), ...Object.values(manifest.flavor)];
for (const p of paths) if (!existsSync(join(ROOT, 'data', p))) errors.push(`manifest lists missing data file data/${p}`);

if (errors.length) {
  console.error(`Static smoke check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('Static smoke check passed.');
