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

  await page.goto('http://localhost:5173/#capabilities', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const capabilitiesSection = page.locator('#capabilities');
  await capabilitiesSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outDir, 'capabilities-header-balanced.png')
  });

  console.log('Saved capabilities-header-balanced.png');
  await browser.close();
}

main().catch(console.error);
