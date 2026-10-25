import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Vector3 } from '@babylonjs/core';
const source = (await fs.readFile(new URL('../src/survivor/enemy-attack.ts', import.meta.url), 'utf8'))
  .replace("'@babylonjs/core'", JSON.stringify(import.meta.resolve('@babylonjs/core')));
const js = stripTypeScriptTypes(source, { mode: 'transform' });
const { EnemyLaserAttack, EnemyAttackPacing } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function fixture(kind = 'mortar') {
  const leased = new Set(), muzzles = new Set();
  let damageCalls = 0;
  const vfx = {
    quad() { const q = {}; leased.add(q); return q; },
    release(q) { assert.ok(leased.delete(q), 'release exactly once'); },
    glowing() {}, tint(q, _color, alpha) { q.alpha = alpha; }, sprite(q, at, size) { q.position = at.clone(); q.size = size; }, decal() {}, flashSprite() {}, streak(_q, from, to) { assert.ok(Vector3.Distance(from, to) <= .901, 'beam-shaped bullet remains short'); },
    ring() { assert.fail('lasers must not spawn blast circles'); },
    sparks() { assert.fail('lasers must not spawn explosions'); },
  };
  const player = { position: new Vector3(), hp: 50, takeDamage(n) { this.hp -= n; damageCalls++; } };
  const target = { type: { attack: kind }, radius: 1.1, position: new Vector3(0, 0, 7), alive: true, stunned: 0, scale: 1, generation: 0, attackHold: 0,
    muzzle(out, index) { muzzles.add(index); return out.set(index ? .5 : -.5, 1.5, 7); } };
  const snow = { depth() { return 0; }, traceSegment() { return null; } };
  const ctx = { vfx, snow, targets: {navigation:{traceCover:(...args)=>snow.traceSegment(...args)}}, sound() { assert.fail('enemy attacks must be silent'); } };
  const attack = new EnemyLaserAttack(ctx, target, player);
  const step = seconds => { for (let i = 0; i < Math.round(seconds * 100); i++) attack.update(.01); };
  return { attack, target, player, snow, leased, muzzles, step, damageCalls: () => damageCalls };
}
for (const kind of ['bolt', 'fan', 'mortar']) {
  const f = fixture(kind); f.step(3.1);
  assert.equal(f.leased.size, kind === 'mortar' ? 6 : 3, 'one laser per barrel; no fan volley');
  if (kind === 'mortar') assert.deepEqual([...f.muzzles].sort(), [0, 1], 'both Crawler turrets charge');
  for (let i = 0; i < 100; i++) f.attack.update(0);
  assert.equal(f.player.hp, 50, 'pause freezes windup');
  f.step(2.8); assert.ok(f.player.hp < 50); assert.equal(f.damageCalls(), 1, 'one damage application per shot');
  assert.equal(f.leased.size, 0, 'beam effects cleaned up');
}
for (const kind of ['bolt', 'fan', 'mortar']) {
  const f = fixture(kind); f.step(3.1); f.player.position.x = 5; f.step(2.8);
  assert.equal(f.player.hp, 50, 'sidestepping locked laser dodges');
  const covered = fixture(kind); covered.snow.traceSegment = () => .1; covered.step(5.9);
  assert.equal(covered.player.hp, 50, 'snow clips laser before player');
  assert.equal(covered.leased.size, 0);
}
for (const interrupt of [f => { f.target.alive = false; }, f => { f.target.stunned = 1; }, f => { f.target.generation++; }, f => { f.player.hp = 0; }]) {
  const f = fixture(); f.step(3.1); interrupt(f); f.step(.01);
  assert.equal(f.leased.size, 0); assert.equal(f.damageCalls(), 0, 'interrupted charge causes no damage');
}
{
  const f = fixture(); f.step(3.1); f.attack.dispose(); assert.equal(f.leased.size, 0);
}
for (const [kind, launch] of [['bolt', 3.8], ['fan', 4.05], ['mortar', 4.25]]) {
  const f = fixture(kind); f.step(launch);
  assert.equal(f.player.hp, 50, 'firing causes no instant damage');
  assert.ok(f.leased.size > 0, 'bullet is in flight');
  f.player.position.x = 5; f.step(2.5);
  assert.equal(f.player.hp, 50, 'can dodge after launch');
  f.attack.dispose(); assert.equal(f.leased.size, 0);
}
{
  const f = fixture('bolt'); f.step(3.8); f.target.alive = false; f.step(1);
  assert.equal(f.player.hp, 45, 'a fired bullet keeps traveling after shooter dies');
}
{
  const f = fixture('bolt'); f.step(3.8); f.attack.update(1);
  assert.equal(f.player.hp, 45, 'swept collision catches a hit across a long frame');
}
console.log('Silent beam-shaped bullets: travel time, post-launch dodge, short trails, paired turrets, swept collision, cover, pause and cleanup passed.');
{
  const pacing = new EnemyAttackPacing(), a = {}, b = {}, c = {};
  assert.ok(pacing.acquire(a));
  assert.equal(pacing.acquire(b), false, 'charge starts are staggered');
  pacing.update(0); assert.equal(pacing.acquire(b), false, 'pause preserves spacing');
  pacing.update(.65); assert.ok(pacing.acquire(b));
  pacing.update(2); assert.equal(pacing.acquire(c), false, 'at most two active attackers');
  pacing.release(a); assert.ok(pacing.acquire(c), 'completed/cancelled attacks release capacity');
}
for (const kind of ['bolt', 'fan', 'mortar']) {
  const f = fixture(kind); f.target.position.set(0, 0, 1.5);
  f.step(3.1); assert.equal(f.player.hp, 50, 'melee has a windup');
  assert.equal(f.leased.size, 2, 'melee warning and charge visible');
  f.step(.6); assert.equal(f.player.hp, 44, 'close enemy strikes once');
  assert.equal(f.leased.size, 0);
  f.step(.5); assert.equal(f.player.hp, 44, 'no continuous contact damage');
}
for (const cancel of [f => { f.player.position.x = 3; }, f => { f.target.stunned = 1; }, f => { f.target.alive = false; }, f => { f.snow.traceSegment = () => .5; }]) {
  const f = fixture(); f.target.position.set(0, 0, 1.5); f.step(3.1); cancel(f); f.step(.6);
  assert.equal(f.player.hp, 50, 'melee can be dodged, interrupted or blocked by cover');
  assert.equal(f.leased.size, 0);
}
console.log('Attack pacing and melee windup, damage, recovery, dodge, interruption, and cover checks passed.');
for (const kind of ['bolt', 'fan', 'mortar']) {
  const f = fixture(kind); f.step(4.3); f.player.position.x = 20;
  f.attack.update(2);
  assert.equal(f.leased.size, kind === 'mortar' ? 6 : 3, 'range expiry retains effects for fizzle');
  const glow = [...f.leased][0], endpoint = glow.position.clone(), initialSize = glow.size;
  f.attack.update(0);
  assert.equal(glow.alpha, 1, 'pause freezes fizzle');
  f.player.position.copyFrom(endpoint).addInPlaceFromFloats(0, -.8, 0);
  f.attack.update(.12);
  assert.equal(f.player.hp, 50, 'expired projectile cannot damage during fizzle');
  assert.ok(glow.alpha > 0 && glow.alpha < 1, 'fizzle fades gradually');
  assert.ok(glow.size < initialSize, 'glow withers');
  assert.ok(glow.position.equals(endpoint), 'fizzle stays at range endpoint');
  f.attack.update(.13);
  assert.equal(f.leased.size, 0, 'fizzle releases all effects');
  f.attack.dispose();
}
console.log('Range fizzle: fade, shrink, stationary endpoint, no damage, pause and cleanup passed.');


// Inactive cancels windup, melee and bullets already in flight, then can resume.
for (const elapsed of [3.1, 4.3]) {
  const f = fixture(); f.step(elapsed);
  f.attack.update(.01, false);
  assert.equal(f.leased.size, 0, 'inactive clears all attack effects');
  assert.equal(f.target.attackHold, 0);
  for (let i = 0; i < 100; i++) f.attack.update(.1, false);
  assert.equal(f.damageCalls(), 0, 'inactive never damages the player');
  f.step(8);
  assert.ok(f.damageCalls() > 0, 'reactivating restores attacks');
  f.attack.dispose();
}
console.log('Inactive attack cancellation and reactivation passed.');
