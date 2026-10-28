import { STORM_ARRIVAL, STORM_CHANNELS, STORM_FLOOD_SPREAD, STORM_RADIUS, STORM_SHOALS, channelOf, stormLakeEdge } from './storm-field.ts';
import type { RangePlacement } from './range-environments.ts';

/** Stormbringer: the falls feed a river that forks around a central island.
 * West bank = pinewood with a ring of tree clumps to kite around; island = open shingle with the walker wreck;
 * east bank = bare slate with a few outcrops. A thick forest border closes the sides and north;
 * a deep lake closes the south. */
// Interlocking boulders bury the island's pointed fork seam, with smaller shoulders downstream.
export const STORM_RIVER_BOULDERS=[
 {x:8,z:31,scale:2.2,yaw:.4},{x:5.7,z:28.2,scale:1.65,yaw:1.5},
 {x:10,z:27.8,scale:1.8,yaw:-.7},{x:7.2,z:25.8,scale:1.25,yaw:2.1},
] as const;
/** The west grove's footprint (darker ground). Inside it, five clumps stand in a ring with
 * 4 m+ lanes between them and an open glade in the middle: pillars, not a wall. */
export const STORM_THICKET={x:-46,z:20,rx:13,rz:9} as const;
export const STORM_GROVE=Array.from({length:5},(_,i)=>{
  const a=i/5*Math.PI*2+.6;
  return {x:STORM_THICKET.x+Math.cos(a)*STORM_THICKET.rx*.9,z:STORM_THICKET.z+Math.sin(a)*STORM_THICKET.rz*.95,r:2.6};
});

export type StormAsset='mech-wreck';
export const STORM_ASSETS:StormAsset[]=['mech-wreck'];
export interface StormKitPlacement {asset:StormAsset;x:number;z:number;yaw:number;scale?:number}

/** True within `margin` metres of any channel's full-flood edge. */
export function nearWater(x:number,z:number,margin:number):boolean{
  return STORM_CHANNELS.some(c=>z>=c.zMin&&z<=c.zMax&&Math.abs(x-c.center(z))<c.half(z)+STORM_FLOOD_SPREAD+margin);
}
/** Within `grow` metres of a grove clump. */
export const inThicket=(x:number,z:number,grow=0)=>STORM_GROVE.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+grow);

export function stormKitPlacements():StormKitPlacement[]{
  // No props from the kit for now; the downed walker was cut.
  return [];
}

/** Range props. Nothing decorative that isn't part of a region's identity. */
export function stormPlacements():RangePlacement[]{
  const out:RangePlacement[]=[];
  const put=(asset:RangePlacement['asset'],x:number,z:number,scale=1,yaw=0,walkable=false)=>{
    if(Math.hypot(x-STORM_ARRIVAL.x,z-STORM_ARRIVAL.z)<10)return;
    out.push({asset,x,z,scale,yaw,...walkable?{walkable}:{}});
  };
  // Forest border: three staggered rows of spruce behind a bush hedge. It's the map edge
  // everywhere except the river mouth (north) and the lake (south); the collision ring sits behind it.
  const dry=(x:number,z:number,m:number)=>!nearWater(x,z,m)&&z>stormLakeEdge(x)+STORM_FLOOD_SPREAD+m;
  for(const [row,r0] of [[0,STORM_RADIUS+1.5],[1,STORM_RADIUS+5],[2,STORM_RADIUS+8.5]] as const){
    const n=Math.round(2*Math.PI*r0/3.3);
    for(let i=0;i<n;i++){
      const a=(i+row*.5)/n*Math.PI*2,r=r0+1.1*Math.sin(i*2.7+row),x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(dry(x,z,1))put(i%11===5&&row>0?'dead-pine':'pine',x,z,1.35+.3*Math.sin(i*1.3+row)+row*.15,i+row);
    }
  }
  for(let i=0;i<150;i++){
    const a=i/150*Math.PI*2,r=STORM_RADIUS-.5+.6*Math.sin(i*3.1),x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(dry(x,z,.5))put(i%4===3?'plant-fern':'plant-bush',x,z,1.5+.3*Math.sin(i*1.7),a);
  }
  // Grove clumps: a tight knot of spruce, ringed by bushes and ferns at the clump's edge.
  for(const [k,c] of STORM_GROVE.entries()){
    put('pine',c.x,c.z,1.3+.1*(k%3),k);
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2+k;put('pine',c.x+Math.cos(a)*1.3,c.z+Math.sin(a)*1.3,1+.15*((i+k)%3),a);}
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2+k*.7;put(i%3===2?'plant-fern':'plant-bush',c.x+Math.cos(a)*(c.r-.3),c.z+Math.sin(a)*(c.r-.3),1.3+.2*Math.sin(i+k),a);}
  }
  // East slate: three low outcrops are the only cover.
  for(const [x,z,s,yaw] of [[36,52,2.2,.4],[58,16,2,1.2],[62,-10,2.1,-.5]] as const)put('rock-flat',x,z,s,yaw);
  for(const b of STORM_RIVER_BOULDERS)put('rock-boulder',b.x,b.z,b.scale,b.yaw);
  // Each shoal is a ford: a winding, staggered line of stepping stones bank to bank, loose rocks
  // scattered through the shallows, and boulders marking both ends on the banks.
  // The stones are walked over, so none of them collide.
  const jit=(n:number)=>Math.sin(n*12.9898)*.5+Math.sin(n*4.1414)*.5;
  for(const [k,h] of STORM_SHOALS.entries()){
    const c=channelOf(h.channel);
    for(let i=0;i<11;i++){
      const t=-.95+i*.19+.05*jit(i+k*7);
      const z=h.z+1.4*Math.sin(t*2.6+k)+(i%2?.55:-.55)+.3*jit(i*3+k);
      put('rock-flat',c.center(z)+t*c.half(z),z,.55+.15*Math.abs(jit(i+k*5)),i*1.9+k,true);
    }
    for(let i=0;i<7;i++){
      const t=-.85+1.7*(.5+.5*jit(i*7.3+k*2.1)),z=h.z+(h.half-.8)*jit(i*5.7+k*3.3);
      put('rock-flat',c.center(z)+t*c.half(z),z,.3+.12*Math.abs(jit(i+k)),i*2.3+k,true);
    }
    for(const side of [-1,1]){
      const half=c.half(h.z);
      put('rock-boulder',c.center(h.z-h.half)+side*(half+1.6),h.z-h.half+.8*jit(k+side),.75,k+side);
      put('rock-boulder',c.center(h.z+h.half)+side*(half+1.6),h.z+h.half+.8*jit(k-side),.65,k-side);
    }
  }
  return out;
}
