import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Vector3 } from '@babylonjs/core';

// Exercise the actual target update without loading renderer/browser dependencies.
const source = await fs.readFile(new URL('../src/survivor/targets.ts', import.meta.url), 'utf8');
const targetSource = source.slice(source.indexOf('export class Target {'), source.indexOf('export class TargetField'));
const js = stripTypeScriptTypes(targetSource, { mode: 'transform' }).replace('export class Target', 'class Target');
const Target = new Function('Vector3', 'turnToward', `${js}; return Target;`)(Vector3, (from) => from);

for (const hasWalk of [false, true]) {
  const idle = {}, walk = {};
  const crowd = { has: () => hasWalk, clip: name => name === 'walk' ? walk : idle };
  const target = new Target({ speed: 3, range: 2, radius: 1 }, crowd, new Vector3(), 60);
  const player = new Vector3(10, 0, 0);
  target.update(.05, player, true);
  const beforeCharge = target.position.clone();
  target.attackHold = 2;
  target.update(.05, player, true);
  assert.equal(target.clip, idle, 'charging immediately switches walking enemies to idle');
  const time = target.clipTime;
  target.update(.1, player, true);
  assert.ok(target.clipTime > time, 'idle animation advances throughout charging');
  assert.deepEqual(target.position, beforeCharge, 'charging still holds movement');
  const pausedTime = target.clipTime;
  target.update(0, player, true);
  assert.equal(target.clipTime, pausedTime, 'game pause holds animation');
  target.stunned = 1;
  target.update(.1, player, true);
  assert.equal(target.clipTime, pausedTime, 'stun still holds animation');
  target.stunned = 0;
  target.attackHold = 0;
  target.update(.1, player, true);
  assert.ok(target.position.x > beforeCharge.x, 'movement resumes after charging');
}
console.log('Charging idle animation, walk transition, movement hold, pause, stun and recovery passed.');
