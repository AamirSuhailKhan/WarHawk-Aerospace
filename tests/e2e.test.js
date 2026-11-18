import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createAppServer } from '../server/server.js';

const SCRATCH_DIR = process.env.SCREENSHOT_DIR || '';

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium/Chrome/Edge executable found on system.');
}

async function runE2E() {
  const tmpData = await fsp.mkdtemp(path.join(os.tmpdir(), 'wh-e2e-test-'));
  const server = createAppServer({ dataDir: tmpData });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless: true
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedAssets = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('/api/contact')) {
        failedAssets.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Load homepage & wait for opening animation
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    // Verify navbar distinction from page background & logo rendering
    const navStats = await page.evaluate(() => {
      const header = document.querySelector('#site-header');
      const body = document.body;
      const logoImg = document.querySelector('.mark img');
      const headerRect = header.getBoundingClientRect();
      return {
        headerBg: getComputedStyle(header).backgroundColor,
        bodyBg: getComputedStyle(body).backgroundColor,
        headerHeight: headerRect.height,
        logoComplete: logoImg && logoImg.complete && logoImg.naturalWidth > 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    });

    assert.notEqual(navStats.headerBg, navStats.bodyBg, 'Navbar background must differ from page background');
    assert.equal(navStats.logoComplete, true, 'Warhawk eagle logo must load cleanly');
    assert.ok(navStats.headerHeight >= 60 && navStats.headerHeight <= 80, 'Navbar height should stay compact');
    assert.ok(navStats.scrollWidth <= navStats.innerWidth, 'No horizontal overflow on 1440px desktop');

    if (SCRATCH_DIR) {
      await page.screenshot({ path: path.join(SCRATCH_DIR, 'after-desktop-hero.png') });
    }

    // 2. Test scroll progression & sticky navbar shrink
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(500);
    const scrolledHeader = await page.evaluate(() => {
      const header = document.querySelector('#site-header');
      return {
        isScrolled: header.classList.contains('is-scrolled'),
        height: header.getBoundingClientRect().height
      };
    });
    assert.equal(scrolledHeader.isScrolled, true, 'Header should enter scrolled state');
    assert.ok(scrolledHeader.height < navStats.headerHeight, 'Scrolled header height should reduce');

    // 3. Test #flight scroll storytelling at 25%, 50%, 75%, 100%, and upward
    const flightMetrics = await page.evaluate(async () => {
      const flight = document.querySelector('#flight');
      const top = flight.getBoundingClientRect().top + window.scrollY;
      const range = flight.offsetHeight - window.innerHeight;
      const samples = [];
      for (const ratio of [0.25, 0.5, 0.75, 0.98, 0.3]) {
        window.scrollTo({ top: top + range * ratio, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 850));
        samples.push({
          ratio,
          stage: document.querySelector('#flight-stage-label').textContent,
          percent: document.querySelector('#flight-percent').textContent
        });
      }
      return samples;
    });
    assert.ok(flightMetrics[0].stage.includes('STAGE 02'), `Expected Stage 02 at 25%, got ${flightMetrics[0].stage}`);
    assert.ok(flightMetrics[2].stage.includes('STAGE 05'), `Expected Stage 05 at 75%, got ${flightMetrics[2].stage}`);
    assert.ok(flightMetrics[4].stage.includes('STAGE 02'), 'Scrolling back upward should reverse stages cleanly');

    // 4. Test #systems layout has ZERO collision between copy and frame
    const systemsCheck = await page.evaluate(async () => {
      const systems = document.querySelector('#systems');
      const top = systems.getBoundingClientRect().top + window.scrollY;
      const range = systems.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + range * 0.9, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 850));
      const copyRect = document.querySelector('.systems-copy').getBoundingClientRect();
      const frameRect = document.querySelector('.systems-frame').getBoundingClientRect();
      return { copyRight: copyRect.right, frameLeft: frameRect.left };
    });
    assert.ok(systemsCheck.copyRight < systemsCheck.frameLeft, `Systems copy (${systemsCheck.copyRight}) must not overlap frame (${systemsCheck.frameLeft})`);

    // 5. Verify homepage #contact is the clean CTA band (no inline form above footer) and capability link opens /contact?category=...
    const homeFormCount = await page.locator('#contact form').count();
    assert.equal(homeFormCount, 0, 'Homepage #contact above footer should be the clean CTA band without an inline form');

    await page.evaluate(() => document.querySelector('#contact').scrollIntoView({ behavior: 'instant' }));
    await page.waitForTimeout(400);
    if (SCRATCH_DIR) {
      await page.screenshot({ path: path.join(SCRATCH_DIR, 'after-desktop-contact.png') });
    }

    await page.locator('.cap-card.cap-one .cap-action').click();
    await page.waitForURL('**/contact?category=Scheduled+Drone+Patrols');
    await page.waitForLoadState('networkidle');
    const selectedCategory = await page.locator('#page-category').inputValue();
    assert.equal(selectedCategory, 'Scheduled Drone Patrols', 'Capability link must open /contact with Scheduled Drone Patrols selected');

    // Verify /contact page uses warm non-bluish background
    const contactPageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(contactPageBg, 'rgb(237, 242, 234)', 'Dedicated /contact page should use warm eye-pleasing sage-ivory background');

    // 6. Test Navbar "Contact Us" navigation from homepage to /contact
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(950);
    await page.locator('header .nav-contact').click();
    await page.waitForURL('**/contact');
    await page.waitForLoadState('networkidle');

    if (SCRATCH_DIR) {
      await page.screenshot({ path: path.join(SCRATCH_DIR, 'after-desktop-contact-page.png') });
    }

    // Verify invalid submission shows validation errors without fake success
    await page.locator('#contact-form-panel button[type="submit"]').click();
    const errText = await page.locator('#page-err-fullName').textContent();
    assert.ok(errText.length > 5, 'Invalid submission must show validation feedback');
    const statusHidden = await page.locator('#contact-form-panel [data-form-status]').getAttribute('class');
    assert.ok(statusHidden.includes('is-error'), 'Form status must show error state on invalid submit');

    // Verify valid submission succeeds with unique reference ID
    await page.fill('#page-fullName', 'Jordan Blake');
    await page.fill('#page-workEmail', 'jordan.blake@aerospace.example');
    await page.fill('#page-phone', '+1 415 555 0144');
    await page.fill('#page-company', 'Skyline Systems');
    await page.selectOption('#page-category', 'Technology Partnership');
    await page.fill('#page-message', 'Exploring autonomous payload integration opportunities for Q3.');
    await page.check('#page-consent');
    await page.locator('#contact-form-panel button[type="submit"]').click();

    await page.waitForSelector('#contact-form-panel .form-status.is-success');
    const successText = await page.locator('#contact-form-panel .form-status.is-success').textContent();
    assert.match(successText, /WH-\d{8}-[A-F0-9]{6}/, 'Success state must include generated Reference ID');

    // 7. Test representative responsive widths for zero horizontal overflow
    for (const width of [1920, 1440, 1024, 768, 390, 360]) {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(950);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      assert.ok(
        overflow.scrollWidth <= overflow.innerWidth,
        `Horizontal overflow detected at ${width}px: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`
      );
    }

    // 8. Mobile menu behavior & mobile screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (SCRATCH_DIR) {
      await page.screenshot({ path: path.join(SCRATCH_DIR, 'after-mobile-hero.png') });
    }
    await page.locator('#menu-toggle').click();
    assert.equal(await page.locator('#mobile-nav').isVisible(), true, 'Mobile menu must open on tap');
    await page.locator('#mobile-nav a.mobile-cta').click();
    await page.waitForURL('**/contact');

    if (SCRATCH_DIR) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCRATCH_DIR, 'after-mobile-contact.png') });
    }

    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    assert.equal(failedAssets.length, 0, `Failed asset requests: ${failedAssets.join('; ')}`);

    console.log('All Playwright E2E, responsive, animation, and contact form tests passed!');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(tmpData, { recursive: true, force: true });
  }
}

runE2E().catch((err) => {
  console.error(err);
  process.exit(1);
});
