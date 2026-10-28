import type { RangePlacement } from './range-environments';

// Camera screen-up is +Z: southeast crater, northwest woodland.
// Centre beyond the arena: the huge inner arc replaces the southeast corner.
export const OUTSKIRTS_CRATER={x:43,z:-43,radius:32,scorchRadius:56,depth:14};
export const CRATER_FIRE_DPS=6;
export const CRATER_CORE_RADIUS=12;
/** Same low-lipped profile drives both rendered mesh and walking height. */
export function outskirtsGroundHeight(x:number,z:number):number{
  const r=Math.hypot(x-OUTSKIRTS_CRATER.x,z-OUTSKIRTS_CRATER.z)/OUTSKIRTS_CRATER.radius;
  if(r>=1)return 0;
  if(r>=.94)return .08*Math.sin((r-.94)/.06*Math.PI);
  const t=r/.94;
  return -OUTSKIRTS_CRATER.depth*(1-t*t*(3-2*t));
}
export function inCraterFire(x:number,z:number):boolean{
  return Math.hypot(x-OUTSKIRTS_CRATER.x,z-OUTSKIRTS_CRATER.z)<OUTSKIRTS_CRATER.radius*.82;
}
export function outskirtsGrove():RangePlacement[]{
  const result:RangePlacement[]=[];
  for(let i=0;i<13;i++){
    const angle=i*2.399,r=i===0?0:3+Math.sqrt(i/12)*4;
    result.push({asset:'jungle-tree',x:-29+Math.cos(angle)*r,z:29+Math.sin(angle)*r,scale:.85+(i%3)*.1,yaw:angle});
  }
  for(let i=0;i<20;i++){
    const angle=i*2.399,r=3+Math.sqrt(i/19)*6;
    result.push({asset:'plant-bush',x:-29+Math.cos(angle)*r,z:29+Math.sin(angle)*r,scale:1.1+(i%3)*.15,yaw:angle});
  }
  return result;
}
