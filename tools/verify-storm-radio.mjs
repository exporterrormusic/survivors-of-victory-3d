import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const out = 'artifacts/storm-radio';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/?run=test-range&environment=storm');
  await page.waitForFunction(() => window.game?.radioEgg?.active && window.game.scene.isReady(), null, { timeout: 240000 });
  await page.evaluate(() => game.engine.stopRenderLoop());
  const draw = () => page.evaluate(() => { game.camera.focus.copyFrom(game.player.position); game.camera.update(1, game.player.position); game.scene.render(); });
  const state = () => page.evaluate(() => ({ step: game.radioEgg.step, icons: document.querySelectorAll('.counters-radio-icon').length }));
  // Trigger a real flood-cycle boundary without waiting thirty seconds.
  await page.evaluate(() => { const g = game; g.storm.field.elapsed = 29; g.radioEgg.update(.01); g.storm.field.elapsed = 30; g.radioEgg.update(.01); });
  assert.equal((await state()).step, 'crate');
  await page.evaluate(() => { const g = game, p = g.radioEgg.crateAt; g.player.position.set(p.x, 0, p.z - 5); g.player.unstick(); });
  await draw();
  await page.screenshot({ path: `${out}/01-crate.png` });
  // A projectile's actual shield collision opens it exactly once and unregisters its hit listeners.
  const hit = await page.evaluate(() => {
    const g = game, e = g.radioEgg, p = e.crateAt, a = p.clone(), b = p.clone(); a.z -= 4; b.z += 4;
    const contact = g.targets.shieldContact(a, b); contact?.shield.block(p, 10);
    const step = e.step; e.hit();
    return { contact: !!contact, step, listeners: g.targets.areaListeners.size, shields: g.targets.shields.size };
  });
  assert.ok(hit.contact); assert.equal(hit.step, 'opening'); assert.equal(hit.listeners, 0); assert.equal(hit.shields, 0);
  await page.evaluate(() => game.radioEgg.update(1.3));
  assert.equal((await state()).step, 'radio');
  await draw();
  await page.screenshot({ path: `${out}/02-open-radio.png` });
  assert.ok(await page.evaluate(() => game.scene.getTransformNodeByName('counters-case-hinge').rotation.x > 1.9));
  await page.evaluate(() => { const g = game; g.player.position.copyFrom(g.radioEgg.crateAt); g.player.unstick(); });
  await page.evaluate(() => game.radioEgg.update(.1));
  assert.equal((await state()).step, 'carrying');
  await draw();
  assert.equal((await state()).icons, 1);
  await page.screenshot({ path: `${out}/03-radio-icon.png` });
  await page.waitForFunction(() => game.radioEgg.squad?.ready, null, { timeout: 120000 });
  assert.ok(await page.evaluate(() => game.radioEgg.squad.members.every(m => !m.root.isEnabled())));
  await page.evaluate(() => game.radioEgg.update(3));
  assert.match(await page.locator('.counters-radio-speech').innerText(), /^Radio:.*requesting/i);
  await page.evaluate(() => { const g = game, at = g.radioEgg.clearing; const trigger = (Math.max(23, g.radioEgg.approachStart - 5) + 12) / 2; g.player.position.set(at.x, 0, at.z - trigger - 1); g.radioEgg.update(5); });
  assert.equal(await page.locator('.counters-radio-speech').count(), 0);
  await page.evaluate(() => { game.player.position.z += 2; game.radioEgg.update(.1); });
  assert.equal(await page.locator('.counters-radio-speech').innerText(), 'Radio: Too many...');
  assert.ok(await page.evaluate(() => game.radioEgg.squad.members.every(m => !m.root.isEnabled())));
  await page.evaluate(() => game.radioEgg.update(4));
  assert.ok(await page.evaluate(() => game.radioEgg.squad.members.every(m => m.root.isEnabled())));
  await page.evaluate(() => game.radioEgg.update(8));
  assert.equal((await state()).step, 'fallen', 'wait for an actual approach');
  // Near the outer body, outside the old four-metre central trigger.
  await page.evaluate(() => { const g = game, at = g.radioEgg.clearing; g.player.position.set(at.x - 6, 0, at.z); g.player.unstick(); g.camera.hold(at, .5, 10); });
  assert.equal((await state()).step, 'fallen');
  const members = await page.evaluate(() => game.radioEgg.squad.members.map(m => ({ id: m.meta.variant, clip: m.current, frame: m.animationGroup('death').getCurrentFrame(), end: m.animationGroup('death').to })));
  assert.equal(members.length, 3); assert.equal(new Set(members.map(m => m.id)).size, 3);
  assert.ok(members.every(m => m.clip === 'death' && Math.abs(m.frame - m.end) < 1));
  await draw(); await page.screenshot({ path: `${out}/07-fallen-squad.png` });
  const start = await page.evaluate(() => {
    const e = game.radioEgg, squad = e.squad;
    const motes = squad.motes.length;
    e.update(1 / 60);
    return { step: e.step, preallocated: motes > 0, unchanged: motes === squad.motes.length,
      alphaReady: squad.luminous.every(m => m.transparencyMode === 2 && m.needDepthPrePass) };
  });
  assert.equal(start.step, 'dissolve', 'approach starts the effect on the next update');
  assert.ok(start.preallocated && start.unchanged && start.alphaReady, 'first effect frame uses prepared resources');
  await page.evaluate(() => game.radioEgg.update(1.5));
  assert.equal((await state()).step, 'dissolve');
  await draw(); await page.screenshot({ path: `${out}/08-golden-dissolve.png` });
  await page.evaluate(() => game.radioEgg.update(4));
  assert.equal((await state()).step, 'done');
  assert.equal(await page.locator('.counters-radio-speech').innerText(), 'I was too late...');
  assert.equal((await state()).icons, 0);
  assert.ok(await page.evaluate(() => game.radioEgg.squad === null));
  // AoE/melee uses the shared area-attack hook as well.
  await page.evaluate(() => { game.radioEgg.goTo('crate'); game.targets.areaHit(() => true); });
  assert.equal((await state()).step, 'opening');
  // Leaving mid-animation / mid-transmission cleans props, icon, audio mix, and hit hooks.
  await page.evaluate(() => { game.radioEgg.goTo('fallen'); game.setRangeEnvironment('forest'); });
  assert.equal((await state()).icons, 0);
  assert.ok(await page.evaluate(() => !game.radioEgg.active && !game.atmosphere.rainSoftened && !game.scene.getTransformNodeByName('counters-case')));
  await page.evaluate(() => game.setRangeEnvironment('storm'));
  assert.equal((await state()).step, 'waiting');
  assert.deepEqual(errors, []);
  console.log('PASS: flood reveal, projectile/area hits, lid and radio animation, HUD pickup, two-message distress, three death poses, golden dissolve, farewell, map cleanup.');
} finally { await browser.close(); }
