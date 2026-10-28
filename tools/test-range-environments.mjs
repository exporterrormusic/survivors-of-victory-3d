import assert from 'node:assert/strict';
import { OUTSKIRTS_SCALE, RANGE_ENVIRONMENTS, RANGE_MOODS, RANGE_PROP_GAP, rangePropRadius, rangePlantNeedsRoadClearance, rangeEnvironmentForZone, rangePlacements, rangeTreeRoadClearance } from '../src/survivor/range-environments.ts';
for(const theme of Object.keys(RANGE_ENVIRONMENTS)){
  const placements=rangePlacements(theme);
  assert.deepEqual(placements,rangePlacements(theme),'placement is deterministic');
  if(theme==='outskirts'){
    // Authored grove intentionally overlaps canopies and undergrowth.
    const {OUTSKIRTS_CRATER:c,outskirtsGrove}=await import('../src/survivor/outskirts-landmarks.ts');
    const {rangeObstacles}=await import('../src/survivor/range-collision.ts');
    assert.equal(outskirtsGrove().length,33);
    assert.ok(rangeObstacles(theme).some(p=>p.x===c.x&&p.z===c.z&&p.r===12),'central fire is a barrier');
    for(const p of placements){
      assert.ok(p.asset==='jungle-tree'||p.asset==='plant-bush');
      assert.ok(Math.hypot(p.x-c.x,p.z-c.z)>c.radius+rangePropRadius(p));
      assert.ok(rangeTreeRoadClearance(p.x,p.z)>rangePropRadius(p));
    }
    continue;
  }
  if(theme==='city'){assert.equal(placements.length,12);continue;} // Rectangular street blocks are tested in test-city.mjs.
  // Authored garden beds intentionally combine underplanting with tree canopies;
  // joined wall runs use rectangular footprints. Dedicated tests verify their routes.
  if(theme==='forest'){
    // Authored map: the lift pad stays clear and nothing solid sits on a cobbled path outside its landmark court.
    const { forestOpenDistance, FOREST_COURTS } = await import('../src/survivor/forest-layout.ts');
    const solid=['pine','dead-pine','rock-boulder','log-fallen','wall-broken'];
    for(const p of placements){
      assert.ok(Math.hypot(p.x,p.z)>7.5,`forest ${p.asset} clears the lift pad`);
      if(solid.includes(p.asset)&&!FOREST_COURTS.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<c.r+2)&&Math.hypot(p.x,p.z)<60)
        assert.ok(forestOpenDistance(p.x,p.z)>-.01,`forest ${p.asset} at ${p.x.toFixed(1)},${p.z.toFixed(1)} stays off the paths`);
    }
    continue;
  }
  if(theme==='sakura'||theme==='frozen'||theme==='storm')continue;
  for(let i=0;i<placements.length;i++){
    const a=placements[i],radius=rangePropRadius(a);
    assert.ok(Math.hypot(a.x,a.z)>=8+radius,'entire visual footprint clears spawn');
    assert.ok(Math.hypot(a.x,a.z)+radius<=46*(theme==='outskirts'?OUTSKIRTS_SCALE:1),'relocation stays in scenery belt');
    for(const b of placements.slice(i+1))assert.ok(
      Math.hypot(a.x-b.x,a.z-b.z)>=radius+rangePropRadius(b)+RANGE_PROP_GAP-1e-8,
      `${theme}: ${a.asset} and ${b.asset} need breathing room`);
    if(rangePlantNeedsRoadClearance(a))assert.ok(
      rangeTreeRoadClearance(a.x,a.z)>=radius+.5-1e-8,`${theme} ${a.asset}: entire plant clears roads`);
  }
  for(const p of placements){
    assert.ok(Number.isFinite(p.x+p.z+p.scale+p.yaw)&&p.scale>0);
    assert.ok(Math.hypot(p.x,p.z)>8,'central training lane stays open');
    assert.notEqual(p.asset,'patch-puddle');
    if(['outskirts','sakura','storm'].includes(theme)&&['sakura','jungle-tree'].includes(p.asset))
      assert.ok(rangeTreeRoadClearance(p.x,p.z)>=2*p.scale+.5-1e-8,`${theme} ${p.asset} roots stay off both roads at ${p.x},${p.z}`);
    if(theme!=='sakura')assert.notEqual(p.asset,'sakura');
    if(theme==='frozen')assert.ok(!['plant-fern','jungle-tree','plant-reeds'].includes(p.asset));
  }
  if(theme==='plain')assert.equal(placements.length,0);
  else if(theme==='outskirts'){
    assert.ok(placements.length>=16);
    assert.ok(placements.every(p=>p.asset==='jungle-tree'||p.asset==='plant-bush'),'outskirts contains only trees and bushes');
  }else assert.ok(placements.length>50);
}
assert.equal(rangeEnvironmentForZone('sakura_night'),'sakura');
assert.equal(rangeEnvironmentForZone('snow_day'),'frozen');
assert.equal(rangeEnvironmentForZone('storm'),'storm');
assert.equal(RANGE_MOODS.storm.weather,'storm');assert.equal(RANGE_MOODS.frozen.snow,'powder');
console.log('Test Range theme selection, deterministic placement, clear lane and biome restrictions passed.');

assert.equal(rangeEnvironmentForZone('outskirts_day'),'outskirts');
assert.equal(RANGE_MOODS.outskirts.weather,'clear');
assert.equal(RANGE_MOODS.outskirts.time,'day');
assert.equal(RANGE_MOODS.sakura.weather,'petals');
