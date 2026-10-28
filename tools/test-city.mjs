import assert from 'node:assert/strict';
import { CITY_ASSETS, cityPlacements, cityOccludes } from '../src/survivor/city-layout.ts';
import { rangeObstacles, traceScenery } from '../src/survivor/range-collision.ts';
import { RANGE_ENVIRONMENTS, rangeEnvironmentForZone } from '../src/survivor/range-environments.ts';
import { NavigationMap } from '../src/navigation.ts';
assert.ok(!('hollow' in RANGE_ENVIRONMENTS));
for(const id of ['grey-ruins','grey_ruins','hollow','hollow_day','hollow_dusk','hollow_night','the_hollow'])assert.equal(rangeEnvironmentForZone(id),'city');
const blocks=cityPlacements(),solids=rangeObstacles('city'),nav=new NavigationMap(solids,34);
for(const p of blocks){
  assert.ok(CITY_ASSETS[p.asset].height>0);
  assert.ok(!nav.clear(p,p,.35),'sealed interiors cannot spawn units');
}
// Central lift area and all four street entrances connect; 1.1m large units fit.
for(const goal of [{x:0,z:32},{x:0,z:-32},{x:22,z:5},{x:-22,z:5},{x:20,z:20},{x:-20,z:-20}]){
  const route=nav.route({x:0,z:0},goal,1.1);
  assert.ok(route,`Street unreachable: ${JSON.stringify(goal)}`);
  let last={x:0,z:0};for(const next of route){assert.ok(nav.clear(last,next,1.1));last=next;}
}
assert.ok(traceScenery(solids,{x:0,y:1,z:-14},{x:30,y:1,z:-14})!==null,'facades stop bullets');
assert.equal(traceScenery(solids,{x:0,y:1,z:-10},{x:0,y:1,z:10}),null,'lift plaza remains open');
assert.ok(!nav.clear({x:0,z:0},{x:0,z:28},1.1),'collapsed wing blocks the direct route');
const detour=nav.route({x:0,z:0},{x:0,z:28},1.1);
assert.ok(detour&&detour.some(p=>Math.abs(p.x)>9),'route uses a side street around the collapsed wing');
const p={asset:'city-tower',x:0,z:0,scale:1,yaw:0};
assert.ok(!cityOccludes({x:0,y:12,z:-15},{x:0,y:1,z:10},p));
assert.ok(Object.values(CITY_ASSETS).every(a=>a.height<=4.2),'all gameplay ruins stay below camera obstruction height');
assert.ok(!cityOccludes({x:15,y:12,z:-15},{x:15,y:1,z:10},p));
assert.ok(!cityOccludes({x:0,y:55,z:-15},{x:0,y:55,z:10},p));
console.log('Grey Ruins: legacy routing, continuous tower footprints, large-unit detours and bullet cover passed.');
