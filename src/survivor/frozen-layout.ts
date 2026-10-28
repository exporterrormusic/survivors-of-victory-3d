import type { RangePlacement } from './range-environments.ts';
import { lakeSnowCover } from './frozen-lake.ts';

export const FROZEN_RADIUS=54;
/** Wind banks in the two open quadrants and along the shore; the lakes are swept bare. */
export const FROZEN_DRIFTS=[
  {x:26,z:26,rx:8,rz:6,h:.5},{x:-26,z:-26,rx:6,rz:8,h:.5},
  {x:38,z:8,rx:5,rz:9,h:.45},{x:-38,z:-8,rx:5,rz:9,h:.45},
  {x:4,z:-45,rx:12,rz:4,h:.45},{x:-6,z:46,rx:12,rz:4,h:.45},
  {x:-12,z:10,rx:5,rz:3,h:.35},{x:12,z:-10,rx:5,rz:3,h:.35},
]
/** Authored drift depth on top of the preset powder; none on the lake ice. */
export function frozenSnowDepth(base:number,x:number,z:number):number{
  let depth=base;
  for(const d of FROZEN_DRIFTS){const t=Math.max(0,1-Math.hypot((x-d.x)/d.rx,(z-d.z)/d.rz));depth+=d.h*t*t*(3-2*t);}
  return depth*lakeSnowCover(x,z);
}

/**
 * Snow basin with two breakable frozen lakes (frozen-lake.ts) in the north-west
 * and south-east quadrants, framed by the forest belt and the mountains behind it.
 */
export function frozenPlacements():RangePlacement[]{
 const list:RangePlacement[]=[];
 const put=(asset:RangePlacement['asset'],x:number,z:number,scale=1,yaw=0)=>list.push({asset,x,z,scale,yaw});
 let seed=79231;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Overlapping mountain feet physically close the perimeter before the arena limit.
 for(let i=0;i<30;i++){
  const a=i*Math.PI*2/30,r=71+Math.sin(i*1.9)*1.2;
  put('frozen-mountain',Math.cos(a)*r,Math.sin(a)*r,1+(.5+.5*Math.sin(i*2.7))*.12,-a);
 }
 // Four staggered forest rows. Small radial waves avoid a clipped circular hedge.
 for(let row=0;row<4;row++)for(let i=0;i<110;i++){
  const a=(i+(row%2)*.5+(rnd()-.5)*.35)*Math.PI*2/110;
  const r=FROZEN_RADIUS-2+row*3+Math.sin(a*5)*1.1+Math.sin(a*9+.8)*.7+(rnd()-.5)*1.3;
  put('pine',Math.cos(a)*r,Math.sin(a)*r,1.5+rnd()*1.2,rnd()*Math.PI*2);
 }
 return list;
}
