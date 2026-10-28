// Browser checks: every squad weapon type fires and hurts Raptures; Capra plants while its beam fires.
// Needs a dev server: npx vite --port 5194 --strictPort. Capture: artifacts/supply-lift/weapons.png.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5194/?run=test-range&mission=survival_round&zone=outskirts_day&character=snow-white');
  await page.waitForFunction(() => window.game?.scene?.isReady() && window.game.sortie, null, { timeout: 180000 });
  await page.evaluate(() => { const g = window.game; g.player.takeDamage = () => false; g.elevator.update(6); g.sortie.update(.01); g.elevator.update(1.81); g.sortie.update(.01); });
  await page.waitForFunction(() => window.game.sortie.round.phase === 'survive');

  // Each weapon: one squad member alone with a dummy Rapture at its preferred range.
  const weapons = await page.evaluate(async () => {
    const g = window.game, supply = g.sortie.supply, out = {};
    const kinds = new Map(supply.pool.map((m) => [m.weapon.kind, m]));
    for (const [kind] of kinds) {
      g.sortie.horde.clear();
      supply.board(0);
      const entry = supply.pool.find((m) => m.weapon.kind === kind);
      supply.pool.splice(supply.pool.indexOf(entry), 1);
      supply.pool.unshift(entry);
      supply.board(1);
      const ally = supply.allies[supply.allies.length - 1];
      ally.position.set(-10, 0, -10); ally.disembark(); g.targets.squad.push(ally);
      const enemy = g.sortie.horde.spawn('capra', -10 + entry.weapon.prefer * .8, -10, 20);
      enemy.scale = 1;
      const hp = enemy.hp;
      for (let i = 0; i < 120; i++) { g.targets.navigation.beginFrame(2); supply.update(.05, g.sortie.round.elapsed, false); ally.afterAnimation(); }
      out[kind] = { damage: Math.round(hp - enemy.hp), name: ally.name };
      ally.hp = 0; ally.takeDamage(1); ally.dispose(); supply.allies.splice(supply.allies.indexOf(ally), 1); supply.leave(ally);
      supply.pool.push({ chibi: ally.chibi, rig: ally.rig, name: ally.name, weapon: ally.weapon });
    }
    return out;
  });
  console.log('Weapons:', weapons);
  for (const [kind, r] of Object.entries(weapons)) assert.ok(r.damage > 0, `${kind} (${r.name}) hurts Raptures`);

  // Capra: planted while charging and firing, beam lasts over two seconds.
  const capra = await page.evaluate(() => {
    const g = window.game; g.sortie.horde.clear();
    g.player.position.set(0, 0, -12);
    const c = g.sortie.horde.spawn('capra', 0, -22, 1); c.scale = 1;
    const member = [...g.sortie.horde.members.values()].find((m) => m.behavior);
    let firing = 0, moved = 0, start = null;
    for (let i = 0; i < 400; i++) {
      g.targets.update(.025, g.player.position); g.sortie.horde.update(.025);
      const beam = member.behavior.beams[0];
      if (beam.busy && !start) start = c.position.clone();
      if (beam.busy) moved = Math.max(moved, Math.hypot(c.position.x - start.x, c.position.z - start.z));
      if (beam.firing) firing += .025;
      if (start && !beam.busy && firing > 0) break;
    }
    return { hp: c.maxHp, firing: +firing.toFixed(2), moved: +moved.toFixed(3) };
  });
  console.log('Capra:', capra);
  assert.ok(capra.hp >= 75);
  assert.ok(capra.firing >= 2, 'beam holds for over two seconds');
  assert.ok(capra.moved < .05, 'Capra stays put while charging and firing');
  await page.screenshot({ path: 'artifacts/supply-lift/weapons.png' });
} finally { await browser.close(); }
assert.deepEqual(errors, []);
console.log('squad weapons: ok');
