// Run with: node --experimental-strip-types tools/test-navigation.mjs
import assert from 'node:assert/strict';
import { NavigationMap, NavigationAgent } from '../src/navigation.ts';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cases = [
  { name: 'single cover', obstacles: [{ x: 0, z: 0, r: 3 }], start: { x: -10, z: 0 }, goal: { x: 10, z: 0 } },
  { name: 'overlapping cover', obstacles: [-4, 0, 4].map(z => ({ x: 0, z, r: 3 })), start: { x: -10, z: 0 }, goal: { x: 10, z: 0 } },
  { name: 'concave pocket', obstacles: [{ x: 0, z: 0, r: 2 }, { x: -3, z: 0, r: 2 }, { x: 3, z: 0, r: 2 }, { x: -4, z: 3, r: 2 }, { x: 4, z: 3, r: 2 }], start: { x: 0, z: 5 }, goal: { x: 0, z: -10 } },
];
let checks = 0;
for (const scenario of cases) for (const radius of [.65, .85, 1.1, 1.2]) for (const dt of [1 / 60, .05]) {
  const map = new NavigationMap(scenario.obstacles, 20);
  const body = { position: { ...scenario.start }, radius, alive: true }, agent = new NavigationAgent(map, radius);
  for (let t = 0; t < 40; t += dt) {
    const before = { ...body.position };
    agent.step(body, scenario.goal, 3.4, dt, [body]);
    assert.ok(map.clear(before, body.position, radius), `${scenario.name}: swept body intersects cover`);
    assert.ok(dist(before, body.position) <= 3.4 * dt + 1e-5, 'ordinary motion must not teleport');
  }
  assert.ok(dist(body.position, scenario.goal) < .1, `${scenario.name}, radius ${radius}, dt ${dt}: did not arrive`);
  checks++;
}

// A blocked click/goal and even an exactly centered initial penetration remain finite.
{
  const map = new NavigationMap([{ x: 0, z: 0, r: 3 }], 20), radius = 1.2;
  const body = { position: { x: 0, z: 0 }, radius, alive: true }, agent = new NavigationAgent(map, radius);
  for (let i = 0; i < 600; i++) agent.step(body, { x: 0, z: 0 }, 3.4, 1 / 60, [body]);
  assert.ok(map.clear(body.position, body.position, radius)); checks++;
}

// Route updates when the destination moves to the other side of an obstacle.
{
  const map = new NavigationMap([{ x: 0, z: 0, r: 3 }], 20);
  const body = { position: { x: -10, z: 0 }, radius: .65, alive: true }, agent = new NavigationAgent(map, .65);
  for (let i = 0; i < 1200; i++) agent.step(body, i < 120 ? { x: 10, z: 0 } : { x: -8, z: 10 }, 3.4, 1 / 60, [body]);
  assert.ok(dist(body.position, { x: -8, z: 10 }) < .1); checks++;
}

// Waiting units form a wall: a follower must go around, rather than shuffle forever.
{
  const map = new NavigationMap([], 30), body = { position: { x: -10, z: 0 }, radius: 1.2, alive: true };
  const blockers = [-3, 0, 3].map(z => ({ position: { x: 0, z }, radius: 1.2, alive: true }));
  const agent = new NavigationAgent(map, body.radius);
  for (let i = 0; i < 3600; i++) agent.step(body, { x: 10, z: 0 }, 3.4, 1 / 60, [body, ...blockers]);
  assert.ok(dist(body.position, { x: 10, z: 0 }) < .1); checks++;
}

// A full mixed-size wave negotiates cover, then retires on arrival as in the game.
{
  const map = new NavigationMap([{ x: 0, z: 0, r: 3 }], 30);
  const bodies = Array.from({ length: 9 }, (_, i) => ({ position: { x: -15 - Math.floor(i / 3) * 2.5, z: (i % 3 - 1) * 2.5 }, radius: i % 2 ? .65 : 1.2, alive: true }));
  const agents = bodies.map(b => new NavigationAgent(map, b.radius)), goal = { x: 15, z: 0 };
  for (let i = 0; i < 3600; i++) bodies.forEach((b, j) => {
    if (!b.alive) return;
    agents[j].step(b, goal, 3.4, 1 / 60, bodies);
    assert.ok(map.clear(b.position, b.position, b.radius));
    if (dist(b.position, goal) < 1) b.alive = false;
  });
  assert.equal(bodies.filter(b => b.alive).length, 0); checks++;
}

// An impassable wall should yield safely, never cross it or produce NaN.
{
  const obstacles = Array.from({ length: 15 }, (_, i) => ({ x: 0, z: -21 + i * 3, r: 2 }));
  const map = new NavigationMap(obstacles, 20), body = { position: { x: -10, z: 0 }, radius: 1.2, alive: true };
  const agent = new NavigationAgent(map, 1.2), goal = { x: 10, z: 0 };
  assert.deepEqual(map.route(body.position, goal, body.radius), []);
  for (let i = 0; i < 180; i++) agent.step(body, goal, 3.4, 1 / 60, [body]);
  assert.deepEqual(body.position, { x: -10, z: 0 }); checks++;
}
// A route inside a concave battleground may not cut across its outside notch.
{
  const boundary=[[-10,-10],[10,-10],[10,10],[3,10],[3,0],[-3,0],[-3,10],[-10,10]].map(([x,z])=>({x,z}));
  const map=new NavigationMap([],120,boundary),body={position:{x:-7,z:6},radius:1.2,alive:true};
  const goal={x:7,z:6},agent=new NavigationAgent(map,body.radius);
  assert.equal(map.clear(body.position,goal,body.radius),false);
  for(let i=0;i<1800;i++) {
    const before={...body.position};agent.step(body,goal,3.4,1/60,[body]);
    assert.ok(map.clear(before,body.position,body.radius),'body crosses the map cliff');
  }
  assert.ok(dist(body.position,goal)<.1);checks++;
}
// Destroying an enemy gate invalidates previously cached routing, opening the direct path.
{
  const gate={x:0,z:0,r:2,active:true},map=new NavigationMap([gate],20),start={x:-6,z:0},goal={x:6,z:0};
  const around=map.route(start,goal,.65);assert.ok(around.length>1);
  gate.active=false;map.invalidate();
  assert.deepEqual(map.route(start,goal,.65),[goal]);checks++;
}
console.log(`Navigation: ${checks} scenarios passed (body sizes, frame rates, moving/blocked goals, crowds, concave boundaries and destroyed gates).`);
// Oblique contact on a rotated capsule wall must retain tangential motion.
for(const fps of [20,60,120])for(const angle of [0,.63,1.4]){
  const tangent={x:Math.cos(angle),z:Math.sin(angle)},normal={x:-Math.sin(angle),z:Math.cos(angle)};
  const obstacles=Array.from({length:41},(_,i)=>({x:tangent.x*(i-20)*.3,z:tangent.z*(i-20)*.3,r:.4}));
  const map=new NavigationMap(obstacles,20),radius=.45;
  let p={x:tangent.x*-3+normal.x*1.02,z:tangent.z*-3+normal.z*1.02};
  for(let frame=0;frame<fps*4;frame++){
    const next=map.slide(p,(tangent.x*2-normal.x*.8)/fps,(tangent.z*2-normal.z*.8)/fps,radius);
    assert.ok(map.clear(p,next,radius),'sliding never crosses rotated cover');
    assert.ok(dist(p,next)<=Math.hypot(2,.8)/fps+1e-8,'contact never accelerates movement');p=next;
  }
  assert.ok(p.x*tangent.x+p.z*tangent.z>3,'continuous wall contact does not glue the body');
  assert.deepEqual(map.slide(p,0,0,radius),p,'no idle or paused drift');
}
console.log('Surface sliding: rotated walls at 20/60/120 fps, no penetration, bounded speed and no idle drift passed.');
