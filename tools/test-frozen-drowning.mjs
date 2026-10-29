import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { FrozenLake, LAKES } from '../src/survivor/frozen-lake.ts';

// Exercise the actual hazard without constructing its WebGL view or player UI.
const source = await fs.readFile(new URL('../src/survivor/frozen-lake-view.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.slice(source.indexOf('export class FrozenLakeHazard')), { mode: 'transform' });
const { FrozenLakeHazard } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const lake = new FrozenLake();
lake.reset(true);
const hazard = new FrozenLakeHazard(lake, { update() {}, set() {} });
const player = { hp: 0, chibi: { root: { position: { y: 0 } } } };
const make = (hover = false, position = LAKES[0]) => ({
  alive: true, hover, position: { ...position }, drowning: 0, stunned: 0, hp: 100,
});
const ground = make(), flying = make(true), dry = make(false, { x: 0, z: 0 });
const heavy = { ...make(), combatTier: 'heavy' }, boss = { ...make(), combatTier: 'boss' };
const targets = { targets: [ground, flying, dry, heavy, boss], squad: [] };
let kills = 0;
const run = { environmentDamage(t, amount) { t.hp -= amount; if (t.hp <= 0) { t.alive = false; kills++; } } };
const step = (dt) => hazard.update(dt, player, targets, run);
step(.1);
assert.equal(ground.drowning, 0, 'intact ice is safe');
lake.shatter(ground.position.x, ground.position.z);
lake.update(1);
step(.5);
assert.ok(ground.drowning > 0 && ground.drowning < 1 && ground.alive, 'sinks visibly before dying');
assert.ok(ground.stunned > 0, 'cannot attack while drowning');
step(0);
assert.equal(ground.drowning, 1 / 3, 'pause does not advance drowning');
step(1);
assert.equal(ground.alive, false, 'drowns after 1.5 seconds');
step(1);
assert.equal(kills, 1, 'death is credited once');
assert.equal(flying.drowning, 0, 'flying Raptures stay above water');
assert.equal(flying.hp, 100);
assert.equal(dry.drowning, 0, 'dry ground is safe');
for(const t of [heavy,boss]){
  assert.equal(t.hp,100,`${t.combatTier} takes no water damage`);
  assert.equal(t.drowning,0,`${t.combatTier} does not drown`);
  assert.equal(t.stunned,0,`${t.combatTier} remains able to crawl out`);
  const exit=lake.escape(t.position);
  assert.ok(exit,`${t.combatTier} has an escape route`);
  assert.equal(lake.depth(exit),0,'escape leads to solid footing');
}
const interrupted = make();
targets.targets.push(interrupted);
step(.2);
assert.ok(interrupted.drowning > 0);
hazard.set(false);
step(.1);
assert.equal(interrupted.drowning, 0, 'changing environments releases surviving Raptures');
console.log('Frozen drowning: sinking, death, flight immunity, pause, and environment reset passed.');
