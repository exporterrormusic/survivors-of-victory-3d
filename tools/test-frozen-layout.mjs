import assert from 'node:assert/strict';
import { rangePlacements } from '../src/survivor/range-environments.ts';
import { rangeObstacles } from '../src/survivor/range-collision.ts';
import { NavigationMap } from '../src/navigation.ts';
import { rangeSnowDepth } from '../src/survivor/snow-field.ts';
import { snowGridAxis } from '../src/survivor/snow-grid.ts';
import { FROZEN_RADIUS, frozenSnowDepth } from '../src/survivor/frozen-layout.ts';
import { lakeEdge } from '../src/survivor/frozen-lake.ts';
const p=rangePlacements('frozen'),obstacles=rangeObstacles('frozen'),nav=new NavigationMap(obstacles,FROZEN_RADIUS);
assert.deepEqual(p,rangePlacements('frozen'));
assert.ok(!p.some(p=>['frozen-tunnel','frozen-spine-north','frozen-spine-south'].includes(p.asset)),'no roofed corridors or dividing ridges');
const perimeter=p.filter(p=>p.asset==='pine'&&Math.hypot(p.x,p.z)>FROZEN_RADIUS-3);
assert.ok(perimeter.length>300,'dense forest belt');
for(let quadrant=0;quadrant<4;quadrant++)assert.ok(perimeter.filter(p=>(p.x>0?1:0)+(p.z>0?2:0)===quadrant).length>60,'forest wraps all sides');
// Open basin: nothing solid inside the forest belt, so every point is reachable in a straight line.
assert.ok(p.every(p=>Math.hypot(p.x,p.z)>FROZEN_RADIUS-6),'no props in play space');
const lift={x:0,z:0};
for(let i=0;i<24;i++){const a=i*Math.PI/12;assert.ok(nav.clear(lift,{x:Math.cos(a)*44,z:Math.sin(a)*44},1.1),'open basin');}
for(let r=6;r<=12;r+=3)for(let i=0;i<16;i++){const a=i*Math.PI/8;assert.ok(nav.clear(lift,{x:Math.cos(a)*r,z:Math.sin(a)*r},1.1),'clear lift plaza');}
const axis=snowGridAxis(152,768,150);
assert.equal(axis.length,801);assert.deepEqual(axis.slice(16,-16),snowGridAxis(152,768),'editable snow covers the arena');
// Drifts sit away from the lift; the plaza keeps preset powder.
assert.ok(frozenSnowDepth(.115,26,26)>.6,'wind bank in the open quadrant');
for(const [x,z] of [[-26,21],[26,-21]])assert.equal(frozenSnowDepth(.115,x,z),0,'lake ice is swept bare');
assert.ok(Math.abs(frozenSnowDepth(.115,0,0)-.115)<1e-9,'lift plaza keeps preset powder');
for(const preset of ['powder','deep','drifts'])for(const x of [-100,-40,0,40,100])for(const z of [-100,-40,100])if(lakeEdge(x,z)<-1.5)assert.ok(frozenSnowDepth(rangeSnowDepth(preset,x,z),x,z)>.08,'no bare border');
console.log(`Frozen North basin: ${p.length} props, ${perimeter.length} boundary pines, open basin and drifts passed.`);

const { register }=await import('node:module');register('./ts-hooks.mjs',import.meta.url);
const { OPERATION_ZONES,operationZone }=await import('../src/frontend/profile/StageData.ts');
assert.deepEqual(OPERATION_ZONES.filter(z=>z.biome==='snowfield').map(z=>z.time),['day','night']);
assert.equal(operationZone('snow_dusk').id,'snow_day','legacy dusk saves migrate to day');
const boundaryNav=new NavigationMap(obstacles.filter(o=>Math.hypot(o.x,o.z)>FROZEN_RADIUS+2&&o.r>10),100);
for(let i=0;i<120;i++){
 const a=i*Math.PI*2/120;
 assert.ok(!boundaryNav.clear({x:Math.cos(a)*(FROZEN_RADIUS-4),z:Math.sin(a)*(FROZEN_RADIUS-4)},{x:Math.cos(a)*(FROZEN_RADIUS+14),z:Math.sin(a)*(FROZEN_RADIUS+14)},.45),'solid mountain perimeter');
}
console.log('Continuous physical perimeter passed.');
