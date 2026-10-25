import assert from 'node:assert/strict';
import { RANGE_ENVIRONMENTS, RANGE_MOODS, RANGE_PROP_GAP, rangePropRadius, rangePlantNeedsRoadClearance, rangeEnvironmentForZone, rangePlacements, rangeTreeRoadClearance } from '../src/survivor/range-environments.ts';
for(const theme of Object.keys(RANGE_ENVIRONMENTS)){
  const placements=rangePlacements(theme);
  assert.deepEqual(placements,rangePlacements(theme),'placement is deterministic');
  for(let i=0;i<placements.length;i++){
    const a=placements[i],radius=rangePropRadius(a);
    assert.ok(Math.hypot(a.x,a.z)>=8+radius,'entire visual footprint clears spawn');
    assert.ok(Math.hypot(a.x,a.z)+radius<=46,'relocation stays in scenery belt');
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
  if(theme==='plain')assert.equal(placements.length,0);else assert.ok(placements.length>50);
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
