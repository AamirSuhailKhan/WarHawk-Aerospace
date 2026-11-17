import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

function findBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No browser found');
}

const ARTIFACTS_DIR = 'C:\\Users\\aamir\\.gemini\\antigravity\\brain\\21e834c2-a1cd-4c60-a4f0-eb64c849cc6d';
const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });

  try {
    // 1. iPhone 14 viewport (390 x 844)
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    console.log('Navigating to homepage...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600); // Wait for loader animation

    // Hero screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-01-hero.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-01-hero.png');

    // Open mobile menu
    await page.locator('#menu-toggle').click();
    await page.waitForTimeout(400); // Wait for menu slide down

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-02-menu-open.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-02-menu-open.png');

    // Close menu by clicking toggle
    await page.locator('#menu-toggle').click();
    await page.waitForTimeout(300);

    // Scroll to flight sequence
    await page.evaluate(() => {
      const flight = document.querySelector('#flight');
      const top = flight.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + 400, behavior: 'instant' });
    });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-03-flight.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-03-flight.png');

    // Scroll to capabilities section
    await page.evaluate(() => {
      document.querySelector('#capabilities').scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-04-capabilities.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-04-capabilities.png');

    // Scroll to footer
    await page.evaluate(() => {
      document.querySelector('.site-footer').scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-05-footer.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-05-footer.png');

    // 2. Android 360 x 800 viewport
    const contextAndroid = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2
    });
    const pageAndroid = await contextAndroid.newPage();
    await pageAndroid.goto(BASE_URL, { waitUntil: 'networkidle' });
    await pageAndroid.waitForTimeout(1600);

    await pageAndroid.screenshot({
      path: path.join(ARTIFACTS_DIR, 'perfect-mobile-06-android360-hero.png'),
      fullPage: false
    });
    console.log('Saved perfect-mobile-06-android360-hero.png');

    await context.close();
    await contextAndroid.close();
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
