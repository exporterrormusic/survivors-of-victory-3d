import assert from 'node:assert/strict';
import { ARK, LANES, OBJECTIVE_SITES, FALLBACK_X, FINAL_X, JUNCTION_X, SPAWN_X, MAP_WIDTH, MAP_DEPTH, walkable, move, lanePath, distance } from '../src/siege/layout.ts';
import { SiegeSimulation } from '../src/siege/simulation.ts';
// Flood-fill the actual walkability predicate; all gameplay sites must connect to the Ark.
const queue=[{...ARK}],seen=new Set([`${ARK.x},${ARK.z}`]);
for(let i=0;i<queue.length;i++)for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
 const p={x:queue[i].x+dx,z:queue[i].z+dz},key=`${p.x},${p.z}`;
 if(!seen.has(key)&&walkable(p)){seen.add(key);queue.push(p);}
}
for(const p of [...OBJECTIVE_SITES,...LANES.flatMap(z=>[{x:0,z},{x:FALLBACK_X,z},{x:SPAWN_X,z}])])assert(seen.has(`${p.x},${p.z}`),`unreachable ${JSON.stringify(p)}`);
const collision={x:10,z:0};move(collision,0,20);assert(walkable(collision));assert(collision.z<9,'cannot cross a blocked island');
const s=new SiegeSimulation();assert(s.defenses.every(d=>d.x<=0));
s.breach(0);assert.equal(s.front(0),FALLBACK_X);assert.equal(s.front(1),0);assert.equal(s.front(2),0);
assert(s.objectives.some(o=>o.id==='rescue-gate-0'&&o.x<0&&walkable(o)));
s.breach(0);assert.equal(s.front(0),FINAL_X);assert(s.objectives.some(o=>o.id==='rescue-fallback-0'&&walkable(o)));
s.paused=true;s.step(.05);assert.equal(s.time,0);s.paused=false;
// A rescue must return physically; interacting by itself never grants reinforcements.
const rescue=s.objectives[0];Object.assign(s.player,{x:rescue.x,z:rescue.z});s.interact();assert.equal(rescue.state,'available');
rescue.guards=0;s.interact();assert.equal(rescue.state,'escorting');assert.equal(s.rescued,0);
s.nextWave=s.nextAllies=Infinity;
const route=[{x:OBJECTIVE_SITES[0].x,z:0},{x:JUNCTION_X,z:0},ARK];
for(const target of route){let guard=0;while(Math.hypot(s.player.x-target.x,s.player.z-target.z)>.3&&guard++<5000){s.player.hp=100;s.step(.04,{x:target.x-s.player.x,z:target.z-s.player.z,sprint:false});}assert(guard<5000);}
for(let i=0;i<1000&&rescue.state!=='complete';i++)s.step(.05);
assert.equal(rescue.state,'complete');assert.equal(s.rescued,1);
const live=new SiegeSimulation();for(let i=0;i<1200;i++)live.step(.05);
assert(live.wave>=3);assert(live.units.some(u=>u.side==='ally'));assert(live.units.some(u=>u.side==='enemy'));
live.damageDefense(live.core,live.core.hp);assert(live.ended);const time=live.time;live.step(.05);assert.equal(live.time,time);
assert.equal(MAP_WIDTH,408);assert.equal(MAP_DEPTH,228);
const mid=lanePath(1);const crossing=mid.slice(1).reduce((sum,p,i)=>sum+distance(mid[i],p),0)/9;
assert(crossing>=40&&crossing<45,'full lane crossing should take about 40 seconds at normal movement speed');
console.log(`Scale: ${MAP_WIDTH} × ${MAP_DEPTH} m; mid-lane end-to-end ${crossing.toFixed(1)} s; adjacent lane rotation ${(Math.abs(LANES[0]-LANES[1])/9).toFixed(1)} s.`);
console.log('PASS: connected lanes/objectives, terrain collision, independent breaches, captured rescue sites, pause, escort delivery, waves and loss.');
