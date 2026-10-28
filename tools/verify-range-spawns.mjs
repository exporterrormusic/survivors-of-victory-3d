// Browser check: the Test Range's Weather Lab spawns a squad NIKKE and drops a health box.
// Needs a dev server: npx vite --port 5194 --strictPort. Capture: artifacts/supply-lift/range-spawns.png.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5194/?run=test-range&character=snow-white');
  await page.waitForFunction(() => window.game?.scene?.isReady(), null, { timeout: 180000 });
  await page.evaluate(() => { document.getElementById('weather-lab').open = true; });
  await page.locator('#lab-spawn-ally').click();
  await page.locator('#lab-spawn-ally').click();
  await page.waitForFunction(() => window.game.targets.squad.length >= 2, null, { timeout: 60000 });
  await page.locator('#lab-drop-crate').click();
  const result = await page.evaluate(() => {
    const g = window.game, squad = g.targets.squad;
    const hp = g.targets.targets.reduce((sum, t) => sum + (t.alive ? t.hp : 0), 0);
    // Step the squad (headless renders ~2 fps) and let it shoot at the training Raptures.
    const supply = squad[0].squad;
    for (let i = 0; i < 160; i++) { g.targets.navigation.beginFrame(2); supply.update(.05, 0, false); for (const a of squad) a.afterAnimation(); }
    const after = g.targets.targets.reduce((sum, t) => sum + (t.alive ? t.hp : 0), 0);
    g.player.hp = 5;
    const crate = supply.crate.position;
    g.player.position.set(crate.x, 0, crate.z);
    supply.update(.05, 0, false);
    return { squad: squad.map((a) => `${a.name} (${a.weapon.kind})`), damage: Math.round(hp - after), healed: g.player.hp > 5, crateGone: !supply.crateWaiting };
  });
  console.log(result);
  assert.equal(result.squad.length, 2);
  assert.ok(result.damage > 0, 'the squad shoots the training Raptures');
  assert.ok(result.healed && result.crateGone, 'the health box heals and is used up');
  await page.locator('#lab-spawn-ally').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'artifacts/supply-lift/range-spawns.png' });
} finally { await browser.close(); }
assert.deepEqual(errors, []);
console.log('range spawns: ok');
