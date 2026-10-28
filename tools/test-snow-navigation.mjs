// Node 22.15+: strip the adapter's types and resolve its extensionless game import.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { NavigationAgent } from '../src/navigation.ts';
import { SnowField } from '../src/survivor/snow-field.ts';
const collisionSource=(await fs.readFile(new URL('../src/survivor/range-collision.ts',import.meta.url),'utf8'))
 .replace("'./range-environments.ts'",JSON.stringify(new URL('../src/survivor/range-environments.ts',import.meta.url).href))
 .replace("'./city-layout.ts'",JSON.stringify(new URL('../src/survivor/city-layout.ts',import.meta.url).href));
const collisionURL=`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(collisionSource)).toString('base64')}`;
const source = (await fs.readFile(new URL('../src/survivor/snow-navigation.ts', import.meta.url), 'utf8'))
  .replace("'../navigation'", JSON.stringify(new URL('../src/navigation.ts', import.meta.url).href))
  .replace("'./range-collision'",JSON.stringify(collisionURL));
const js = stripTypeScriptTypes(source);
const { SnowNavigationMap } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const bounds = { minX: -12, minZ: -12, width: 24, depth: 24 };
const make = depthAt => { const snow = new SnowField({ bounds, resolution: 256, depthAt }); return { snow, map: new SnowNavigationMap(snow, 11) }; };
const wall = (x, z) => Math.abs(x) < 1.2 && Math.abs(z) < 3 ? 1.6 : .1;
function travel(map, snow, from, goal, radius, fps = 60, seconds = 12) {
  const body = { position: { ...from }, radius, alive: true }, agent = new NavigationAgent(map, radius);
  let maxZ = 0, length = 0;
  for (let frame = 0; frame < fps * seconds && Math.hypot(body.position.x - goal.x, body.position.z - goal.z) > .1; frame++) {
    map.beginFrame(); const before = { ...body.position };
    agent.step(body, goal, 3.4 * snow.speedScale(body.position.x, body.position.z), 1 / fps, []);
    assert.ok(map.clear(before, body.position, radius), 'Every accepted segment stays inside the arena');
    length += Math.hypot(body.position.x - before.x, body.position.z - before.z);
    maxZ = Math.max(maxZ, Math.abs(body.position.z));
  }
  return { remaining: Math.hypot(body.position.x - goal.x, body.position.z - goal.z), maxZ, length };
}
const results = [];
for (const radius of [.6, 1.1, 1.2]) for (const fps of [20, 60, 120]) {
  const { snow, map } = make(wall);
  const result = travel(map, snow, { x: -6, z: 0 }, { x: 6, z: 0 }, radius, fps);
  assert.ok(result.remaining < .15 && result.maxZ < .01, JSON.stringify(result));
  results.push({ radius, fps, ...result });
}
const u = make((x, z) => ((Math.abs(x) > 2 && Math.abs(x) < 3 && z > -4 && z < 3) || (Math.abs(x) < 3 && z > -4 && z < -3)) ? 1.6 : .1);
const concave = travel(u.map, u.snow, { x: 0, z: 0 }, { x: 0, z: -7 }, .6, 60, 18);
assert.ok(concave.remaining < .15 && concave.length < 7.2, JSON.stringify(concave));
const gap = make((x, z) => Math.abs(x) < 1 && Math.abs(z) > 1 && Math.abs(z) < 6 ? 1.6 : .1);
assert.ok(gap.map.clear({ x: -5, z: 0 }, { x: 5, z: 0 }, .6));
assert.ok(gap.map.clear({ x: -5, z: 0 }, { x: 5, z: 0 }, 1.2));
const enclosed = make((x, z) => Math.hypot(x, z) > 2 && Math.hypot(x, z) < 4 ? 1.6 : .1);
const impossible = travel(enclosed.map, enclosed.snow, { x: 0, z: 0 }, { x: 7, z: 0 }, .6, 60, 12);
assert.ok(impossible.remaining < .15, 'Enemies cross enclosing snow banks');

const edit = make(() => .1); edit.map.beginFrame(); const before = edit.map.version;
assert.equal(edit.map.route({ x: -6, z: 0 }, { x: 6, z: 0 }, 1.1).length, 1);
edit.snow.fill(wall); edit.map.beginFrame();
assert.ok(edit.map.version > before && edit.map.route({ x: -6, z: 0 }, { x: 6, z: 0 }, 1.1).length === 1);
const bankVersion = edit.map.version;
edit.snow.resetTrails(); edit.map.beginFrame(); assert.equal(edit.map.version, bankVersion, 'Footprint reset does not rebuild navigation');
const safe = edit.map.project({ x: 0, z: 0 }, 1.1); assert.ok(edit.map.clear(safe, safe, 1.1));
const pushed = { x: -3, z: 0 }; edit.map.push(pushed, 8, 0, 1.1); assert.ok(pushed.x > 4.9, 'Knockback crosses snow banks');
edit.snow.enabled = false; edit.map.beginFrame();
assert.ok(edit.map.version > bankVersion); assert.equal(edit.map.route({ x: -6, z: 0 }, { x: 6, z: 0 }, 1.1).length, 1);
edit.snow.enabled = true; edit.map.beginFrame(0);
assert.deepEqual(edit.map.requestRoute({ x: -6, z: 0 }, { x: 6, z: 0 }, 1.1), [{ x: 6, z: 0 }], 'Crossing snow needs no detour search');
console.log(JSON.stringify({ passed: true, results, concave, impossible, safe, pushed }, null, 2));

assert.equal(edit.map.clear({ x: 0, z: 0 }, { x: 12, z: 0 }, 1.1), false, 'Arena boundary still blocks movement');
assert.ok(edit.snow.speedScale(0, 0) < 1 && edit.snow.speedScale(0, 0) > 0, 'Banks slow without stopping');
