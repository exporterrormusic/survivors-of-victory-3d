// Node 22+: node --experimental-strip-types tools/test-snow.mjs
import assert from 'node:assert/strict';
import { SnowField, rangeSnowDepth, createSnowTrack, RAPTURE_SNOW_CONTACTS } from '../src/survivor/snow-field.ts';
const bounds = { minX: -6, minZ: -6, width: 12, depth: 12 };
const uniform = depth => new SnowField({ bounds, resolution: 256, depthAt: () => depth });
const walk = (field, p, dx, dz, frames = 60) => {
  for (let i = 0; i < frames; i++) { const before = { ...p }; field.move(p, dx / frames, dz / frames, .45); field.trail(before, p); }
  return p;
};

const powder = uniform(.1), deep = uniform(.65);
const lightTravel = walk(powder, { x: -4, z: 0 }, 6, 0).x + 4;
const deepTravel = walk(deep, { x: -4, z: 0 }, 6, 0).x + 4;
assert.ok(lightTravel > 5.99);
assert.ok(deepTravel < lightTravel * .7 && deepTravel > lightTravel * .38, `deep travel ${deepTravel}`);
assert.ok(deep.depth(-3.38, .19) < .5, 'First separate boot impression');
assert.ok(deep.depth(-3.38, 0) > deep.depth(-3.38, .19), 'Discrete boot impressions remain below the gently compressed path');
assert.ok(deep.depth(-3.5, 1) > .64, 'Tracks must stay local');
const stationary = deep.data.slice(); deep.trail({ x: 0, z: 0 }, { x: 0, z: 0 });
assert.deepEqual(deep.data, stationary, 'Standing still must not dig');
deep.trail({ x: -4, z: -4 }, { x: 4, z: 4 });
assert.deepEqual(deep.data, stationary, 'Teleporting must not draw a trail');
deep.resetTrails(); assert.ok(deep.depth(-3.5, 0) > .64);
assert.ok(deep.data.some((v, i) => i % 4 === 0 && v > 0));
assert.ok(!deep.data.some((v, i) => (i % 4 === 1 || i % 4 === 2) && v > 0));

const wall = new SnowField({ bounds, resolution: 256, depthAt: (x) => x >= 0 && x <= .5 ? 1.5 : .1 });
for (const displacement of [6, 30]) {
  const p = { x: -2, z: 0 }; wall.move(p, displacement, 0, .45);
  assert.ok(p.x > .5 && p.x < -2 + displacement, `Cross banks at reduced speed: ${p.x}`);
}
const slide = { x: -.6, z: -2 }; wall.move(slide, 2, 4, .45);
assert.ok(slide.z > -2 && slide.x > -.4, 'Cross banks diagonally');
wall.trail({ x: -.2, z: 0 }, { x: .3, z: 0 });
assert.ok(wall.depth(.2, 0) < .15, 'Walking carves contacted snow');
wall.enabled = false;
const disabled = { x: -2, z: 0 }; wall.move(disabled, 4, 0, .45); assert.ok(disabled.x > 1.99);
assert.equal(wall.depth(0, 0), 0); assert.equal(wall.speedScale(0, 0), 1);
assert.equal(powder.depth(100, 100), 0);
assert.equal(powder.speedScale(100, 100), 1);

const travelByFps = [20, 60, 120].map(fps => walk(uniform(.65), { x: -4, z: 0 }, 6, 0, fps).x + 4);
assert.ok(Math.max(...travelByFps) - Math.min(...travelByFps) < .12, JSON.stringify(travelByFps));
assert.ok(rangeSnowDepth('drifts', -4, 3.4) > 1.5);
assert.equal(rangeSnowDepth('off', 0, 0), 0);
assert.equal(rangeSnowDepth('drifts', 38, 0), 0);

const shapes = ['boot', 'spike', 'hook'].map(shape => {
  const f = uniform(.4); f.stampFoot(0, 0, 0, shape); return f;
});
assert.notDeepEqual(shapes[0].data, shapes[1].data);
assert.notDeepEqual(shapes[1].data, shapes[2].data);
assert.equal(RAPTURE_SNOW_CONTACTS.bma002, null, 'Hovering Lure has no prints');
const preserved = shapes[0].data.slice();
shapes[0].refill(60, 0); shapes[0].refill(0, 1);
assert.deepEqual(shapes[0].data, preserved, 'Clear weather and pause preserve impressions');
const beforeFill = shapes[0].depth(0, .08);
shapes[0].refill(15, .75);
const partialFill = shapes[0].depth(0, .08);
assert.ok(partialFill > beforeFill && partialFill < .39, 'Snowfall gradually raises the depression');
shapes[0].refill(40, .75);
assert.ok(shapes[0].depth(0, .08) > .39, 'Snowfall eventually fills the print');
assert.equal(shapes[0].markedPixels.size, 0, 'Finished prints leave the active set');
const refillByFps = [20, 60, 120].map(fps => {
  const f = uniform(.4); f.stampFoot(0, 0, 0, 'boot');
  for (let i = 0; i < 15 * fps; i++) f.refill(1 / fps, .75);
  return f.depth(0, .08);
});
assert.ok(Math.max(...refillByFps) - Math.min(...refillByFps) < .002);

const multi = uniform(.3), a = createSnowTrack('spike'), b = createSnowTrack('hook');
multi.trail({x: -3, z: -2}, {x: -2.1, z: -2}, a);
const firstPhase = a.phase;
multi.trail({x: 1, z: 2}, {x: 1.9, z: 2}, b);
assert.equal(a.phase, firstPhase, 'Each actor has an independent gait');
assert.ok(b.phase > 0);
// Every projectile uses the same world-space surface, independent of walking thresholds.
const cover = new SnowField({ bounds, resolution: 256, depthAt: x => x >= 0 && x <= .3 ? 1.7 : 0 });
const from = { x: -4, y: 1, z: 0 }, to = { x: 4, y: 1, z: 0 };
const impact = cover.traceSegment(from, to);
assert.ok(impact > .48 && impact < .52, `High-speed crossing ${impact}`);
assert.equal(cover.traceSegment({ ...from, y: 2 }, { ...to, y: 2 }), null, 'Above crest clears');
assert.ok(cover.traceSegment({ ...from, y: 1.8 }, { ...to, y: 1.8 }, .15) !== null, 'Projectile body touches snow');
assert.equal(cover.traceSegment({ x: .1, y: .5, z: 0 }, to), 0, 'Starting embedded impacts immediately');
assert.ok(cover.traceSegment({ x: .1, y: 3, z: 0 }, { x: .1, y: -1, z: 0 }) > .3, 'Vertical descent');
assert.equal(cover.traceSegment({ x: 8, y: -1, z: 0 }, { x: 8, y: -2, z: 0 }), null, 'Outside tile');
const whole = cover.traceSegment(from, to);
const partEnd = { x: .2, y: 1, z: 0 };
const part = cover.traceSegment(from, partEnd);
assert.ok(Math.abs((-4 + whole * 8) - (-4 + part * 4.2)) < .001, 'Same contact with different frame lengths');
cover.enabled = false; assert.equal(cover.traceSegment(from, to), null);
const raised = new SnowField({ bounds, resolution: 64, heightAt: () => 3, depthAt: () => .5 });
assert.equal(raised.traceSegment({ x: 0, y: 3.4, z: 0 }, { x: 1, y: 3.4, z: 0 }), 0);
assert.equal(raised.traceSegment({ x: 0, y: 4, z: 0 }, { x: 1, y: 4, z: 0 }), null);
console.log(JSON.stringify({ passed: true, lightTravel, deepTravel, travelByFps, beforeFill, partialFill, refillByFps }));
