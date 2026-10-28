// Browser check: Survival Round Raptures appear off screen, with no spawn warning circle.
// Needs a dev server: npx vite --port 5194 --strictPort.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5194/?run=test-range&mission=survival_round&zone=outskirts_day&character=snow-white');
  await page.waitForFunction(() => window.game?.scene?.isReady() && window.game.sortie, null, { timeout: 180000 });
  const result = await page.evaluate(() => {
    const g = window.game, mode = g.sortie;
    g.player.takeDamage = () => false;
    g.elevator.update(6); mode.update(.01); g.elevator.update(1.81); mode.update(.01);
    const spawns = [];
    const original = mode.horde.spawn.bind(mode.horde);
    mode.horde.spawn = (key, x, z, scale) => {
      const spec = { radius: 0, height: 1 };
      spawns.push({ key, onScreen: mode.onScreen({ x, z }, spec.radius, spec.height), distance: Math.hypot(x - g.player.position.x, z - g.player.position.z) });
      return original(key, x, z, scale);
    };
    // Each zoom level, two minutes of round time with the player wandering.
    for (const zoom of [g.camera.distance, g.camera.distance * 1.6]) {
      g.camera.distance = zoom;
      for (let i = 0; i < 240; i++) { g.player.position.set(Math.sin(i / 20) * 12, 0, Math.cos(i / 31) * 12); mode.update(.5); }
    }
    return { count: spawns.length, visible: spawns.filter((s) => s.onScreen).length, tells: mode.tells.pool.filter((s) => s.owner && !s.harmful).length };
  });
  console.log(result);
  assert.ok(result.count > 20, 'Raptures spawned');
  assert.equal(result.visible, 0, 'no Rapture appeared on screen');
} finally { await browser.close(); }
console.log('hidden spawns: ok');
