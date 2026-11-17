import path from 'node:path';
import { chromium } from 'playwright-core';

function findBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (paths) return p;
  }
  throw new Error('No browser');
}

const ARTIFACTS_DIR = 'C:\\Users\\aamir\\.gemini\\antigravity\\brain\\21e834c2-a1cd-4c60-a4f0-eb64c849cc6d';
const BASE_URL = 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });

  try {
    // 1. Desktop 1440x900
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await desktopContext.newPage();

    console.log('Navigating to homepage on desktop...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    // Hero
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-01-desktop-hero.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-01-desktop-hero.png');

    // Manifesto Fleet Card
    await page.evaluate(() => {
      document.querySelector('#manifesto').scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-02-desktop-manifesto.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-02-desktop-manifesto.png');

    // Flight sequence
    await page.evaluate(() => {
      const flight = document.querySelector('#flight');
      const top = flight.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + 600, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-03-desktop-flight.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-03-desktop-flight.png');

    // Systems Section
    await page.evaluate(() => {
      const systems = document.querySelector('#systems');
      const top = systems.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + 400, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-04-desktop-systems.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-04-desktop-systems.png');

    // Capabilities Service 02 Target Reticle
    await page.evaluate(() => {
      document.querySelector('#cap-ondemand').scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-05-desktop-capability-target.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-05-desktop-capability-target.png');

    // Contact page
    await page.goto(`${BASE_URL}/contact`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-06-desktop-contact-page.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-06-desktop-contact-page.png');

    // 2. Mobile 390x844
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1600);

    await mobilePage.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-07-mobile-hero.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-07-mobile-hero.png');

    // Mobile flight
    await mobilePage.evaluate(() => {
      const flight = document.querySelector('#flight');
      const top = flight.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + 400, behavior: 'instant' });
    });
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({
      path: path.join(ARTIFACTS_DIR, 'drone-showcase-08-mobile-flight.png'),
      fullPage: false
    });
    console.log('Saved drone-showcase-08-mobile-flight.png');

    await desktopContext.close();
    await mobileContext.close();
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
