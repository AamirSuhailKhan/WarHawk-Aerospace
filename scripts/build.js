import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const jsFiles = ['server.js', 'script.js', 'contact-form.js', 'db.js', 'api/index.js', 'api/health.js', 'api/contact.js'];
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
}

await fsp.rm(dist, { recursive: true, force: true });
await fsp.mkdir(dist, { recursive: true });

const copyTargets = [
  'index.html',
  'contact.html',
  'admin-login.html',
  'admin.html',
  'privacy.html',
  'terms.html',
  'styles.css',
  'script.js',
  'contact-form.js',
  'robots.txt',
  'sitemap.xml',
  'server.js',
  'db.js',
  'package.json',
  '.env.example',
  'README.md',
  'vercel.json'
];

for (const item of copyTargets) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) {
    await fsp.copyFile(src, path.join(dist, item));
  }
}

// Copy api directory
const apiSrc = path.join(root, 'api');
const apiDest = path.join(dist, 'api');
if (fs.existsSync(apiSrc)) {
  await fsp.mkdir(apiDest, { recursive: true });
  const apiFiles = await fsp.readdir(apiSrc);
  for (const file of apiFiles) {
    await fsp.copyFile(path.join(apiSrc, file), path.join(apiDest, file));
  }
}

const assetsSrc = path.join(root, 'assets');
const assetsDest = path.join(dist, 'assets');
await fsp.mkdir(assetsDest, { recursive: true });
const assetFiles = await fsp.readdir(assetsSrc);
for (const file of assetFiles) {
  if (file === 'drone.svg') continue; // Legacy unused SVG placeholder
  await fsp.copyFile(path.join(assetsSrc, file), path.join(assetsDest, file));
}

console.log(`Build succeeded: verified syntax and wrote production bundle to ${dist}`);

