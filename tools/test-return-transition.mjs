import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Lightweight Babylon scene exercises the same new-Phaser-scene lifecycle as quitting a match.
  await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5173'}/tools/review/environment-skies.html`);
  await page.waitForFunction(() => window.skyReview?.scene.isReady());
  await page.evaluate(async () => {
    history.replaceState(null, '', '/');
    const { returnToMainMenu } = await import('/src/frontend/return-to-menu.ts');
    returnToMainMenu();
  });
  await page.waitForURL('**/?preview=main-menu&menuLoading=1', { timeout: 20000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-menu-loading'), null, { timeout: 120000 });
  assert.equal(await page.locator('#menu-loading-frame').count(), 0);
  assert.equal(await page.locator('#front-end canvas').count(), 1);
  assert.deepEqual(errors, []);
  console.log('Quit transition completed its cover, navigation, and menu handoff.');
} finally {
  await browser.close();
}
