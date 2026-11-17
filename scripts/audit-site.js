import fs from 'node:fs';
import path from 'node:path';
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

const BASE_URL = 'http://127.0.0.1:5173';

async function auditSite() {
  const report = {
    links: { tested: 0, broken: [] },
    images: { tested: 0, broken: [] },
    filterTabs: { tested: 0, failures: [] },
    hashNavigation: { tested: 0, failures: [] },
    formValidation: { tested: 0, failures: [] },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    overflows: []
  };

  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push({ url: page.url(), text: msg.text() });
    });
    page.on('pageerror', (err) => {
      report.pageErrors.push({ url: page.url(), message: err.message });
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('/api/contact')) {
        report.failedRequests.push({ url: res.url(), status: res.status() });
      }
    });

    console.log('[Audit] 1. Loading Homepage...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    // 1. Audit all links on Homepage
    console.log('[Audit] 2. Checking all links on Homepage...');
    const homeLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: a.getAttribute('href'),
        text: a.innerText.trim(),
        id: a.id || ''
      }));
    });

    for (const link of homeLinks) {
      report.links.tested++;
      const { href, text } = link;
      if (href.startsWith('#')) {
        const targetId = href.slice(1);
        const exists = await page.evaluate((id) => Boolean(document.getElementById(id)), targetId);
        if (!exists) {
          report.links.broken.push({ page: 'index.html', href, text, reason: `Target element #${targetId} not found` });
        }
      } else if (href.startsWith('/')) {
        const res = await page.request.get(`${BASE_URL}${href}`);
        if (res.status() >= 400) {
          report.links.broken.push({ page: 'index.html', href, text, reason: `HTTP status ${res.status()}` });
        }
      }
    }

    // 2. Audit all images on Homepage
    console.log('[Audit] 3. Checking all images on Homepage...');
    const homeImages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.getAttribute('src'),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        alt: img.getAttribute('alt')
      }));
    });

    for (const img of homeImages) {
      report.images.tested++;
      if (!img.complete || img.naturalWidth === 0) {
        report.images.broken.push({ page: 'index.html', src: img.src, reason: 'Failed to load or zero naturalWidth' });
      }
    }

    // 3. Test Capabilities Filter Tabs
    console.log('[Audit] 4. Testing Capabilities filter buttons...');
    const filterButtons = ['all', 'surveillance', 'inspection'];
    for (const filter of filterButtons) {
      report.filterTabs.tested++;
      await page.click(`button[data-filter="${filter}"]`);
      await page.waitForTimeout(200);

      const check = await page.evaluate((f) => {
        const cards = Array.from(document.querySelectorAll('.cap-card'));
        const activeBtn = document.querySelector(`button[data-filter="${f}"]`).classList.contains('is-active');
        let hiddenIncorrectly = 0;
        let shownIncorrectly = 0;

        for (const card of cards) {
          const cat = card.getAttribute('data-category');
          const isHidden = card.classList.contains('is-hidden');
          if (f === 'all') {
            if (isHidden) hiddenIncorrectly++;
          } else if (cat === f) {
            if (isHidden) hiddenIncorrectly++;
          } else {
            if (!isHidden) shownIncorrectly++;
          }
        }
        return { activeBtn, hiddenIncorrectly, shownIncorrectly };
      }, filter);

      if (!check.activeBtn || check.hiddenIncorrectly > 0 || check.shownIncorrectly > 0) {
        report.filterTabs.failures.push({ filter, details: check });
      }
    }

    // 4. Test Hash Deep Linking & Highlighting
    console.log('[Audit] 5. Testing capability card hash deep linking...');
    const hashTargets = ['cap-patrol', 'cap-inspection', 'cap-detection'];
    for (const target of hashTargets) {
      report.hashNavigation.tested++;
      await page.goto(`${BASE_URL}/#${target}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const isHighlighted = await page.evaluate((id) => {
        const card = document.getElementById(id);
        return card && card.classList.contains('is-highlighted');
      }, target);
      if (!isHighlighted) {
        report.hashNavigation.failures.push({ target, reason: 'Card not highlighted on hash visit' });
      }
    }

    // 5. Audit Contact Page
    console.log('[Audit] 6. Navigating to Contact page & checking links/images...');
    await page.goto(`${BASE_URL}/contact`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const contactLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: a.getAttribute('href'),
        text: a.innerText.trim()
      }));
    });

    for (const link of contactLinks) {
      report.links.tested++;
      const { href, text } = link;
      if (href.startsWith('#')) {
        const targetId = href.slice(1);
        const exists = await page.evaluate((id) => Boolean(document.getElementById(id)), targetId);
        if (!exists) {
          report.links.broken.push({ page: 'contact.html', href, text, reason: `Target element #${targetId} not found` });
        }
      } else if (href.startsWith('/')) {
        const res = await page.request.get(`${BASE_URL}${href}`);
        if (res.status() >= 400) {
          report.links.broken.push({ page: 'contact.html', href, text, reason: `HTTP status ${res.status()}` });
        }
      }
    }

    const contactImages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.getAttribute('src'),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      }));
    });

    for (const img of contactImages) {
      report.images.tested++;
      if (!img.complete || img.naturalWidth === 0) {
        report.images.broken.push({ page: 'contact.html', src: img.src, reason: 'Failed to load or zero naturalWidth' });
      }
    }

    // 6. Test Form Validation Edge Cases on Contact Page
    console.log('[Audit] 7. Testing form validation edge cases...');
    report.formValidation.tested++;
    // Submit empty
    await page.click('button[type="submit"]');
    const nameErr = await page.textContent('#page-err-fullName');
    const emailErr = await page.textContent('#page-err-workEmail');
    const catErr = await page.textContent('#page-err-category');
    const msgErr = await page.textContent('#page-err-message');
    const consentErr = await page.textContent('#page-err-consent');

    if (!nameErr || !emailErr || !catErr || !msgErr || !consentErr) {
      report.formValidation.failures.push({
        test: 'Empty form submission',
        reason: 'Missing validation error message on one or more required fields',
        errors: { nameErr, emailErr, catErr, msgErr, consentErr }
      });
    }

    // Invalid email test
    report.formValidation.tested++;
    await page.fill('#page-fullName', 'Test User');
    await page.fill('#page-workEmail', 'not-an-email');
    await page.selectOption('#page-category', 'Scheduled Drone Patrols');
    await page.fill('#page-message', 'Testing valid message length over 10 characters.');
    await page.check('#page-consent');
    await page.click('button[type="submit"]');
    const invalidEmailErr = await page.textContent('#page-err-workEmail');
    if (!invalidEmailErr || !invalidEmailErr.toLowerCase().includes('email')) {
      report.formValidation.failures.push({
        test: 'Invalid email test',
        reason: `Expected email error message, got: "${invalidEmailErr}"`
      });
    }

    // 7. Test Responsive Overflow Across Viewports
    console.log('[Audit] 8. Checking horizontal overflow across viewports...');
    const viewports = [1920, 1440, 1024, 768, 480, 390, 360, 320];
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));

      if (overflow.scrollWidth > overflow.innerWidth) {
        report.overflows.push({ width, scrollWidth: overflow.scrollWidth, innerWidth: overflow.innerWidth });
      }
    }

    await browser.close();
  } catch (err) {
    report.unexpectedError = err.message;
    await browser.close();
  }

  console.log('AUDIT_REPORT_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('AUDIT_REPORT_END');
}

auditSite();
