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

const srcWebp = 'C:/Users/aamir/.gemini/antigravity/brain/21e834c2-a1cd-4c60-a4f0-eb64c849cc6d/.user_uploaded/media_1794838319126_69347b11.webp';

fs.copyFileSync(srcWebp, 'assets/drone-enterprise.webp');
console.log('Copied assets/drone-enterprise.webp');

async function main() {
  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('file:///' + srcWebp);
  const dataUrl = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  });

  const base64Data = dataUrl.split(',')[1];
  fs.writeFileSync('assets/drone-enterprise.png', Buffer.from(base64Data, 'base64'));
  console.log('Saved assets/drone-enterprise.png');

  // Let's also check if we want to replace or overwrite drone-real.jpg with a high quality transparent png / webp
  fs.copyFileSync('assets/drone-enterprise.png', 'assets/drone-real.png');
  console.log('Also created assets/drone-real.png alias');

  await browser.close();
}

main().catch(console.error);
