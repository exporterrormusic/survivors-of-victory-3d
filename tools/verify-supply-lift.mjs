// Browser checks for the Survival Round supply lift, squad, level-up feedback, talent-pick input,
// moving Rapture attacks, and the Settings DATA / NOTICE screens.
// Needs a dev server: npx vite --port 5194 --strictPort. Captures: artifacts/supply-lift/.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:5194/';
const OUT = 'artifacts/supply-lift';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  await page.goto(`${BASE}?run=test-range&mission=survival_round&zone=outskirts_day&character=snow-white`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.game?.scene?.isReady() && window.game.sortie, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.game; g.player.takeDamage = () => false;
    g.elevator.update(6); g.sortie.update(.01); g.elevator.update(1.81); g.sortie.update(.01);
  });
  await page.waitForFunction(() => window.game.sortie.round.phase === 'survive', null, { timeout: 60000 });
  // Headless frames are slow: grow the horde without waiting minutes.
  await page.evaluate(() => { for (let i = 0; i < 40; i++) window.game.sortie.update(.5); });
  console.log('Round started.');

  // Level-up feedback: burst overlay plus glowing choices.
  // Level 1 → 2 brings no new tier (the Lv 1 choice is already waiting): no big notice.
  await page.evaluate(() => window.game.run.gainXp(window.game.run.xpToNext));
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.level-up-burst.lu-play').count(), 0, 'no notice without a new talent tier');
  // Up to Lv 4, which unlocks a tier.
  await page.evaluate(() => { const r = window.game.run; while (r.level < 4) r.gainXp(r.xpToNext); });
  await page.waitForSelector('.level-up-burst.lu-play', { timeout: 5000 });
  // Playwright can capture before a CSS animation paints: pause it at a known frame.
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName?.startsWith('lu')) { a.pause(); a.currentTime = 450; } });
  await page.screenshot({ path: `${OUT}/level-up.png` });
  await page.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName?.startsWith('lu')) a.finish(); });
  assert.equal(await page.locator('#run-talent-pick[data-state="ready"] .tp-option').count(), 3);
  console.log('Level-up burst and talent glow shown.');

  // Picking a talent with the mouse keeps held movement.
  // Off the lift deck first: walking right from the middle runs into the shaft wall.
  await page.evaluate(() => window.game.player.position.set(-12, 0, 8));
  await page.mouse.move(720, 300);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.game.player.position.x);
  await page.locator('.tp-option').first().click();
  await page.waitForTimeout(500);
  const moved = await page.evaluate(() => ({ x: window.game.player.position.x, vx: window.game.player.motion.x }));
  await page.keyboard.up('KeyD');
  assert.ok(moved.vx > 1, `still walking after the pick (vx ${moved.vx.toFixed(2)})`);
  assert.ok(moved.x > before + .5, 'kept moving right through the click');
  console.log('Talent pick keeps WASD held.');

  // Raptures keep walking while they wind up an attack.
  await page.waitForFunction(() => window.game.targets.targets.filter((t) => t.alive && t.scale > .99).length >= 4, null, { timeout: 60000 });
  const strafe = await page.evaluate(async () => {
    const g = window.game, samples = [];
    for (let i = 0; i < 90; i++) {
      await new Promise(requestAnimationFrame);
      for (const t of g.targets.targets) if (t.alive && t.attackHold > 0 && t.rooted <= 0) samples.push({ t, x: t.position.x, z: t.position.z });
      if (samples.length > 12) break;
    }
    await new Promise((r) => setTimeout(r, 150));
    const moving = samples.filter((s) => Math.hypot(s.t.position.x - s.x, s.t.position.z - s.z) > .02).length;
    return { samples: samples.length, moving };
  });
  console.log('Attacking Raptures sampled:', strafe);
  if (strafe.samples) assert.ok(strafe.moving / strafe.samples > .5, 'most attacking Raptures keep moving');

  // Supply lift: bring the next delivery forward and let it run in real time.
  assert.ok(await page.evaluate(() => window.game.sortie.supply.pool.length >= 5), 'squad pool loaded before the round');
  await page.evaluate(() => {
    const g = window.game; g.player.position.set(0, 0, 9);
    g.sortie.supply.nextDelivery = g.sortie.round.elapsed;
  });
  await page.waitForFunction(() => window.game.elevator.state.action !== 'idle', null, { timeout: 5000 });
  console.log('Lift cycling.');
  // Run the 15.6 s cycle quickly; the supply lift sees the same elevator states as in play.
  // Mid-rise the squad and crate are already on the deck, visible, below ground level.
  const riding = await page.evaluate(() => {
    const g = window.game, step = () => { g.elevator.update(.1); g.sortie.supply.update(.1, g.sortie.round.elapsed, true); };
    for (let i = 0; i < 115; i++) step();
    const riders = g.sortie.supply.allies.filter((a) => a.riding);
    return { action: g.elevator.state.action, height: g.elevator.state.height, riders: riders.length,
      shown: riders.every((a) => a.chibi.root.isEnabled()), crate: g.sortie.supply.crate.isEnabled() };
  });
  console.log('Mid-rise:', riding);
  assert.equal(riding.action, 'rise');
  assert.ok(riding.riders > 0 && riding.shown && riding.crate, 'squad and crate visible while the cage rises');
  await page.screenshot({ path: `${OUT}/riding.png` });
  await page.evaluate(() => { const g = window.game; for (let i = 0; i < 60; i++) { g.elevator.update(.1); g.sortie.supply.update(.1, g.sortie.round.elapsed, true); } });
  await page.waitForFunction(() => window.game.sortie.supply.count > 0, null, { timeout: 60000 });
  const arrival = await page.evaluate(() => ({ squad: window.game.sortie.supply.count, crate: window.game.sortie.supply.crateWaiting, hud: document.querySelector('.survival-objective')?.textContent }));
  console.log('Delivered:', arrival);
  assert.ok(arrival.crate, 'health crate on the deck');
  // Headless runs at ~2 fps, so step the squad through 10 s of game time to check it routes out
  // of the lift and around the tower to the player.
  const squad = await page.evaluate(() => {
    const g = window.game; g.player.position.set(-8, 0, 8);
    for (let i = 0; i < 200; i++) { g.targets.navigation.beginFrame(0); g.sortie.supply.update(.05, g.sortie.round.elapsed, true); }
    return g.sortie.supply.allies.filter((a) => a.alive).map((a) => ({ x: a.position.x, z: a.position.z, fromPlayer: Math.hypot(a.position.x + 8, a.position.z - 8) }));
  });
  console.log('Squad positions:', squad);
  assert.ok(squad.every((a) => Math.hypot(a.x, a.z) > 2.5), 'squad left the deck');
  assert.ok(squad.every((a) => a.fromPlayer < 15), 'squad stays within its leash of the player');
  // Raptures go after the squad too: some pick a squad member, and the squad takes hits.
  const targeted = await page.evaluate(() => {
    const g = window.game, mode = g.sortie;
    let chosen = 0;
    for (let i = 0; i < 160; i++) {
      g.targets.update(.05, g.player.position); mode.update(.05);
      chosen = Math.max(chosen, g.targets.targets.filter((t) => t.alive && t.victim).length);
    }
    const squad = mode.supply.allies.map((a) => ({ name: a.name, hp: Math.round(a.hp), alive: a.alive }));
    return { chosen, squad, registered: g.targets.squad.length };
  });
  console.log('Targeting:', targeted);
  assert.ok(targeted.chosen > 0, 'some Raptures chose a squad member');
  assert.ok(targeted.squad.length === 0 || targeted.squad.some((a) => !a.alive || a.hp < 40), 'the squad took damage (or fell and was recycled)');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/squad.png` });

  // Crate heals.
  await page.evaluate(() => { const g = window.game; g.player.hp = 10; g.player.position.set(0, 0, 0); });
  await page.waitForFunction(() => !window.game.sortie.supply.crateWaiting, null, { timeout: 5000 });
  assert.ok(await page.evaluate(() => window.game.player.hp > 10));
  console.log('Crate healed.');

  // Front end: NOTICE and Settings > DATA.
  const menu = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  menu.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  await menu.goto(`${BASE}?preview=settings&settings=data`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await menu.waitForTimeout(9000);
  await menu.screenshot({ path: `${OUT}/settings-data.png` });
  await menu.goto(`${BASE}?preview=main-menu`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await menu.waitForTimeout(9000);
  await menu.screenshot({ path: `${OUT}/main-menu.png` });
  await menu.mouse.click(1440 * 1578 / 1920, 810 * 121 / 1080);
  await menu.waitForTimeout(1500);
  await menu.screenshot({ path: `${OUT}/notice.png` });
  console.log('Front-end captures saved.');
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log('supply lift: ok');
