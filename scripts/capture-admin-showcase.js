import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No browser found.');
}

async function main() {
  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });

  const outDir = 'C:\\Users\\aamir\\.gemini\\antigravity\\brain\\21e834c2-a1cd-4c60-a4f0-eb64c849cc6d';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Admin Login page
  await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, 'admin-portal-01-login.png') });
  console.log('Saved admin-portal-01-login.png');

  // 2. Log in
  await page.fill('#username', 'admin');
  await page.fill('#password', 'Warhawk@Admin2026!');
  await page.click('#submitBtn');
  await page.waitForURL('**/admin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'admin-portal-02-dashboard.png') });
  console.log('Saved admin-portal-02-dashboard.png');

  // 3. Privacy Policy
  await page.goto('http://localhost:5173/privacy', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, 'admin-portal-03-privacy.png') });
  console.log('Saved admin-portal-03-privacy.png');

  // 4. Terms of Service
  await page.goto('http://localhost:5173/terms', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, 'admin-portal-04-terms.png') });
  console.log('Saved admin-portal-04-terms.png');

  await browser.close();
  console.log('All admin showcase screenshots captured successfully.');
}

main().catch(console.error);
