import assert from 'node:assert/strict';
import { SnowField, createSnowTrack } from '../src/survivor/snow-field.ts';

function fixture() {
  const snow = new SnowField({ bounds: { minX: -4, minZ: -3, width: 8, depth: 6 }, resolution: 256,
    depthAt: x => Math.abs(x) < .8 ? 1.8 : .5 });
  const original = [-2, 0, 2].map(x => snow.freshDepth(x, 0));
  const cross = x => snow.trail({ x, z: -.1 }, { x, z: .1 }, createSnowTrack());
  return { snow, original, cross };
}
for (const fps of [20, 60, 120]) {
  const { snow, original, cross } = fixture();
  const advance = seconds => { for (let i = 0; i < seconds * fps; i++) snow.refill(1 / fps, 1); };
  const cut = [];
  cross(-2); cut.push(snow.freshDepth(-2, 0)); advance(10);
  cross(0); cut.push(snow.freshDepth(0, 0)); advance(10);
  cross(2); cut.push(snow.freshDepth(2, 0)); advance(15.1);
  assert.equal(snow.freshDepth(-2, 0), original[0], 'oldest section finishes first');
  const progress = [0, 2].map((x, i) => (snow.freshDepth(x, 0) - cut[i + 1]) / (original[i + 1] - cut[i + 1]));
  assert.ok(progress[0] > progress[1] + .2, 'deep middle heals ahead of the later shallow exit');
  advance(10);
  assert.equal(snow.freshDepth(0, 0), original[1], 'deep middle completes second');
  assert.ok(snow.freshDepth(2, 0) < original[2], 'exit still remembers its later contact');
  advance(10);
  assert.equal(snow.freshDepth(2, 0), original[2], 'exit completes last');
  assert.equal(snow.displacedPixels.size, 0, 'completed depth records are released');
}
{
  const { snow, original, cross } = fixture();
  cross(-2); cross(2); snow.refill(20, 1); cross(-2);
  const paused = snow.data.slice();
  snow.refill(0, 1); snow.refill(60, 0);
  assert.deepEqual(snow.data, paused, 'pause and clear weather preserve local ages');
  snow.refill(15.1, 1);
  assert.equal(snow.freshDepth(2, 0), original[2], 'revisiting does not delay other sections');
  assert.ok(snow.freshDepth(-2, 0) < original[0], 'revisited section gets a new recovery timer');
  snow.resetTrails(); snow.refill(40, 1);
  assert.equal(snow.freshDepth(-2, 0), original[0], 'reset discards old recovery timers');
}
console.log('Chronological snow recovery, depth independence, revisits, pause, reset and frame-rate checks passed.');
