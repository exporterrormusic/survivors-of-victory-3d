import assert from 'node:assert/strict';
import { rangePlacements, rangeTreeRoadClearance, rangePropRadius } from '../src/survivor/range-environments.ts';
import { SAKURA_PAVING, SAKURA_SCALE } from '../src/survivor/sakura-layout.ts';
import { rangeObstacles, traceScenery } from '../src/survivor/range-collision.ts';
import { SAKURA_ASSETS } from '../src/survivor/sakura-assets.ts';
import { NavigationMap } from '../src/navigation.ts';
const props=rangePlacements('sakura'),solids=rangeObstacles('sakura'),nav=new NavigationMap(solids,34*SAKURA_SCALE);
assert.deepEqual(props,rangePlacements('sakura'));
for(const asset of SAKURA_ASSETS)assert.ok(props.some(p=>p.asset===asset),`${asset} appears in the garden`);
for(const p of props)assert.ok(!['cover-crate','ruin','wall-broken','fallen-column','cliff-face'].includes(p.asset),'Sakura uses its own architecture');
for(const p of props.filter(p=>p.asset==='sakura-roofed-gate'||p.asset==='sakura-torii')){
  const world=(x,z)=>({x:p.x+(Math.cos(p.yaw)*x+Math.sin(p.yaw)*z)*p.scale,z:p.z+(-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z)*p.scale});
  const a=world(0,-3),b=world(0,3);
  assert.ok(nav.clear(a,b,1.1),'large units pass through the opening');
  assert.equal(traceScenery(solids,{...a,y:1},{...b,y:1}),null,'shots pass through the opening');
  const post=world(p.asset==='sakura-torii'?5.5:6.6,p.asset==='sakura-torii'?0:.9);
  assert.ok(!nav.clear(post,post,.3),'gate pillars are solid');
}
for(const z of [-32,24])assert.ok(nav.clear({x:0,z:0},{x:0,z},1.1),'entrance and shrine approach remain open');
const crossGates=props.filter(p=>p.asset==='sakura-torii'&&p.z===-7*SAKURA_SCALE).sort((a,b)=>a.x-b.x);
assert.deepEqual(crossGates.map(p=>p.x),[-24,-12,12,24].map(x=>x*SAKURA_SCALE),'regularly spaced torii on both cross-road approaches');
for(const p of crossGates){assert.equal(p.yaw,Math.PI/2);assert.ok((11-1.1)*p.scale>=11,'at least 11 m between solid post footprints');}
for(const z of [-10,-7,-4])assert.ok(nav.clear({x:-31,z},{x:31,z},1.1),'large units can walk across the full road through every torii');
for(const goal of [{x:-18,z:7},{x:18,z:7},{x:-28,z:-7},{x:28,z:-7},{x:-12,z:24},{x:12,z:24}]){
  const route=nav.route({x:0,z:0},goal,1.1);assert.ok(route,`garden route reachable: ${JSON.stringify(goal)}`);
  let last={x:0,z:0};for(const next of route){assert.ok(nav.clear(last,next,1.1));last=next;}
}
for(const p of props){
  assert.ok(Number.isFinite(p.x+p.z+p.scale+p.yaw)&&p.scale>0);
  assert.ok(Math.hypot(p.x,p.z)>8,'central lift clearing preserved');
  assert.ok(Math.hypot(p.x,p.z)+rangePropRadius(p)<46*SAKURA_SCALE,'scenery stays inside visual belt');
  if(p.asset==='sakura'){
    const radius=rangePropRadius(p);
    assert.ok(rangeTreeRoadClearance(p.x/SAKURA_SCALE,p.z/SAKURA_SCALE)>=(radius/SAKURA_SCALE)+.5,`tree canopy clears avenue: ${p.x},${p.z}`);
    for(const pad of SAKURA_PAVING){
      const dx=Math.max(0,Math.abs(p.x-pad.x*SAKURA_SCALE)-pad.halfX*SAKURA_SCALE),dz=Math.max(0,Math.abs(p.z-pad.z*SAKURA_SCALE)-pad.halfZ*SAKURA_SCALE);
      assert.ok(Math.hypot(dx,dz)>radius,`tree canopy clears garden paving: ${p.x},${p.z}`);
    }
  }
}
for(const p of props.filter(p=>p.asset==='sakura-lantern'))assert.ok(props.some(q=>q.asset===p.asset&&q.x===-p.x&&q.z===p.z&&q.scale===p.scale),'lantern pairs remain aligned');
const shrine=props.find(p=>p.asset==='sakura-shrine'),torii=props.find(p=>p.asset==='sakura-torii');
assert.equal(shrine.x,torii.x);assert.equal(shrine.yaw,0);assert.ok(shrine.z>torii.z,'shrine faces down its approach');
for(const p of props.filter(p=>p.asset==='sakura-shrine'))assert.ok(!nav.clear(p,p,.3),'sealed shrine interiors cannot spawn units');
console.log(`Sakura: ${props.length} placements, six custom assets, solid pillars/shrines, open gates and clear main road passed.`);
