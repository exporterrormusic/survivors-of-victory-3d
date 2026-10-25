import assert from 'node:assert/strict';
for(const map of ['three-lane','single-lane']){
 globalThis.location={search:`?map=${map}`};
 const {LANES,JUNGLE_PATHS,COMPOUNDS,SPAWN_POINTS,BASE_POINTS,onPlantingRoad}=await import(`../src/battleground.ts?test=${map}`);
 for(const path of [...LANES.map(l=>l.points),...JUNGLE_PATHS,...['blue','red'].map(t=>[SPAWN_POINTS[t],BASE_POINTS[t]])]){
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],p={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
   assert.ok(onPlantingRoad(p,.3),`${map}: plants excluded from road centers`);
  }
 }
 for(const c of COMPOUNDS)assert.ok(onPlantingRoad(c.building,1));
 for(const lane of LANES){
  const a=lane.points[0],b=lane.points[1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
  const offset=lane.width/2+2.2+1.2-.01;
  assert.ok(onPlantingRoad({x:(a.x+b.x)/2-dz/len*offset,z:(a.z+b.z)/2+dx/len*offset},1.2),'full footprint clears feathered shoulder');
 }
 assert.equal(onPlantingRoad({x:1000,z:1000},1),false);
 console.log(`${map}: lanes, jungle paths, base approaches, courts and shoulders protected`);
}
