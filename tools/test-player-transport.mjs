import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Vector3 } from '@babylonjs/core';

// Exercise the real player update without loading the browser or character assets.
const source = await fs.readFile(new URL('../src/survivor/player.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.slice(source.indexOf('export class Player {')), { mode: 'transform' });
const Player = new Function(`${js.replace('export class Player', 'class Player')}; return Player;`)();
const player = Object.create(Player.prototype);
const updates = [];
Object.assign(player, {
  transported: true,
  dashing: .2,
  velocity: new Vector3(12, 0, 0),
  position: new Vector3(1, -2, 1),
  dashCooldown: .8,
  kit: { busy: true },
  rig: { legYaw: .7, update: (dt, input) => updates.push({ dt, ...input }) },
});
const input = new Proxy({}, { get: () => { throw new Error('Transport must not read gameplay input'); } });
for (let frame = 0; frame < 10; frame++) player.update(.05, input, new Vector3());
assert.equal(player.dashing, 0, 'boarding cancels an active dash');
assert.equal(player.velocity.length(), 0, 'transport clears running velocity');
assert.deepEqual(player.position, new Vector3(1, -2, 1), 'lift retains ownership of position');
assert.equal(updates.length, 10, 'idle blends advance on every transport frame, even when the kit is busy');
for (const update of updates) assert.deepEqual(update, {
  dt: .05, moveX: 0, moveZ: 0, speed: 0, aimYaw: .7, posture: 'relaxed',
});
assert.equal(player.dashCooldown, .8, 'boarding does not grant another dash');
player.transported = false;
player.update(.05, input, new Vector3());
assert.equal(player.dashing, 0, 'release does not restore the interrupted dash');
console.log('Player transport: dash cancellation, idle updates, input lock and position ownership passed.');
