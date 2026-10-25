import assert from 'node:assert/strict';
import { SnowField, createSnowTrack } from '../src/survivor/snow-field.ts';
const make = () => new SnowField({ bounds: { minX: -4, minZ: -4, width: 8, depth: 8 }, resolution: 512, depthAt: () => 1.2 });
for (const radius of [.45, 1.2]) {
  const snow = make(), original = snow.data.slice(), track = createSnowTrack();
  snow.trail({ x: 0, z: -1 }, { x: 0, z: 1 }, track, 0, radius);
  assert.ok(snow.depth(0, 0) < .15, 'centre of contacted path is cleared');
  for (const [x, z] of [[radius * .6, 0], [0, 1 + radius * .6], [0, -1 - radius * .6]]) {
    assert.ok(snow.freshDepth(x, z) > .4 && snow.freshDepth(x, z) < .8, 'sides and both ends have a broad rounded shoulder');
  }
  assert.equal(snow.depth(0, 1 + radius + .05), 1.2, 'snow beyond contact remains untouched');
  assert.ok(snow.depth(0, 1 + radius * .95) > 1.18, 'cut meets original hill with a gentle slope');
  assert.ok(snow.depth(radius + .09, 0) <= 1.23, 'side lips stay low');
  const settled = snow.data.slice();
  snow.trail({ x: 0, z: 0 }, { x: 0, z: 0 }, track, 0, radius);
  assert.deepEqual(snow.data, settled, 'standing still never expands the cut');
  snow.refill(1, 1);
  assert.ok(snow.depth(0, 0) > .12, 'snowfall refills paths');
  snow.resetTrails();
  assert.deepEqual(snow.data, original, 'reset restores snow and lips');
  snow.trail({ x: -3, z: 0 }, { x: 3, z: 0 }, track);
  assert.deepEqual(snow.data, original, 'teleports never carve');
}
console.log('Rounded carving edges, contact limits, low lips, refill and reset passed.');

// An actual sloping bank, not just a uniform slab: the depth threshold must not
// create a new cliff between untouched powder and the cleared hill centre.
const hill = new SnowField({ bounds: { minX: -2, minZ: -2, width: 4, depth: 4 }, resolution: 512,
  depthAt: (_x, z) => Math.max(0, .8 + z * .4) });
hill.trail({ x: 0, z: -1 }, { x: 0, z: 1 }, createSnowTrack());
for (let z = -.7; z < .7; z += .01) {
  assert.ok(Math.abs(hill.freshDepth(0, z + .01) - hill.freshDepth(0, z)) < .017,
    'hill approach stays gradual through the old carving threshold');
}
assert.ok(hill.freshDepth(0, -.5) < .6, 'blend starts on the approach rather than at the hill centre');

// Walk up from powder in small frames: the channel must already exist before
// reaching deep snow, rather than leaving isolated steps up to a trench wall.
const approach = new SnowField({ bounds: { minX: -2, minZ: -3, width: 4, depth: 6 }, resolution: 512,
  depthAt: (_x, z) => Math.max(.1, .1 + (z + 2) * .3) });
const approachTrack = createSnowTrack();
for (let z = -2; z < 2; z += .05) {
  approach.trail({ x: 0, z }, { x: 0, z: z + .05 }, approachTrack);
}
assert.ok(approach.freshDepth(0, -5 / 3) < .18, 'shallow 20cm approach already has a continuous depression');
assert.ok(approach.freshDepth(0, -1) < .13, 'path is established before the bank reaches 40cm');
assert.ok(approach.freshDepth(0, 0) < .13, 'deeper snow continues the existing path');

