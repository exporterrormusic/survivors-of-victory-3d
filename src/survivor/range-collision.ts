import type { GroundObstacle } from '../navigation';
import { OUTSKIRTS_CRATER, CRATER_CORE_RADIUS } from './outskirts-landmarks.ts';
import { FOREST_RADIUS } from './forest-layout.ts';
import { FROZEN_RADIUS, rangePlacements, type RangeEnvironment } from './range-environments.ts';
import { CITY_ASSETS, isCityAsset } from './city-layout.ts';

export interface SceneryObstacle extends GroundObstacle { height:number }
interface Point3 { x:number;y:number;z:number }
/** Stable, inexpensive solid footprints, separate from foliage cards and wind. */
export function rangeObstacles(theme:RangeEnvironment):SceneryObstacle[] {
  const out:SceneryObstacle[]=[];
  if(theme==='volcano'){
    for(let i=0;i<128;i++){
      const a=i/128*Math.PI*2,r=56+Math.sin(a*19)*.7;
      out.push({x:Math.cos(a)*r,z:Math.sin(a)*r,r:2,height:24});
    }

  }
  if(theme==='outskirts')out.push({x:OUTSKIRTS_CRATER.x,z:OUTSKIRTS_CRATER.z,r:CRATER_CORE_RADIUS,height:0});
  for(const p of rangePlacements(theme)){
    if(p.walkable)continue;
    const add=(x:number,z:number,r:number,height:number)=>out.push({
      x:p.x+(Math.cos(p.yaw)*x+Math.sin(p.yaw)*z)*p.scale,
      z:p.z+(-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z)*p.scale,r:r*p.scale,height:height*p.scale});
    // Overlapping discs form capsule walls; openings remain actual openings.
    const wall=(x:number,z:number,length:number,width:number,height:number,alongZ=false)=>{
      const n=Math.max(1,Math.ceil(length/(width*.65)));
      for(let i=0;i<=n;i++){const t=-length/2+i*length/n;add(x+(alongZ?0:t),z+(alongZ?t:0),width*.55,height);}
    };
    if(isCityAsset(p.asset)){
      const a=CITY_ASSETS[p.asset];
      // Filled lattice, not just a perimeter: spawn and navigation cannot treat
      // the sealed building interior as a reachable pocket.
      const step=.8,nx=Math.ceil(a.width/step),nz=Math.ceil(a.depth/step);
      for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++)
        add(-a.width/2+(ix+.5)*a.width/nx,-a.depth/2+(iz+.5)*a.depth/nz,.57,a.height);
      continue;
    }
    switch(p.asset){
      case 'frozen-mountain':add(0,0,17,38);add(0,-6,13,25);add(0,6,13,25);break;
      case 'frozen-outcrop':add(0,0,2.6,6.5);add(1.6,.6,1.2,4.5);add(-1.5,.9,1.2,4.5);add(.7,-1.6,1.1,3.5);add(-1.1,-1.3,1,2.6);break;
      case 'frozen-barrier':wall(0,0,3.2,.9,1.3);break;
      case 'frozen-beacon':add(0,0,.5,4.6);break;
      case 'frozen-hangar':
        for(let x=-5;x<=5;x+=2)for(let z=-4;z<=4;z+=2)add(x,z,1.42,6.5);
        for(const z of [0,2,4])add(7,z,1.8,4.4);break;
      case 'frozen-relay':
        for(let x=-3;x<=3;x+=2)for(let z=-2.5;z<=2.5;z+=1.7)add(x,z,1.42,4);
        for(const x of [6,8])add(x,2,1.2,2.6);break;
      case 'forest-lamp':add(0,0,.45,2.2);break;
      case 'forest-lychgate':add(-3.4,0,.5,4.5);add(3.4,0,.5,4.5);break;
      case 'forest-chapel':
        // Walk-in nave: side and rear walls plus the two halves of the front gable.
        for(const x of [-3.5,3.5])wall(x,.5,10.6,.9,3.6,true);
        wall(0,5.6,7.6,.8,3);for(const x of [-2.6,2.6])wall(x,-5.3,1.9,.8,3.6);break;
      case 'forest-grave':case 'forest-cross':add(0,-.6,.42,1.2);break;
      case 'forest-fence':wall(0,0,3.4,.5,1.4);break;
      case 'forest-menhir':add(0,0,.7,3.5);break;
      case 'forest-altar':wall(0,0,2.8,1.3,1.1);break;
      case 'forest-cabin':
        // Match the open cabin: perimeter logs and split front wall, no filled interior.
        for(const x of [-3,3])wall(x,0,5.2,.42,2.75,true);
        wall(0,2.5,6.2,.42,2.75);
        for(const x of [-2,2])wall(x,-2.5,2.05,.42,2.75);
        wall(3.48,1.7,.85,.72,4.3,true);break;
      case 'forest-woodpile':wall(0,0,2.6,1.1,1.4);break;
      case 'forest-well':add(0,0,1.2,1.1);break;
      case 'forest-jack-o-lantern':add(0,0,.5,.85);break;
      case 'sakura-roofed-gate':
        for(const x of [-6.6,6.6])for(const z of [-.9,.9])add(x,z,.55,5.6);break;
      case 'sakura-torii':add(-5.5,0,.55,5.3);add(5.5,0,.55,5.3);break;
      case 'sakura-lantern':add(0,0,.58,2.7);break;
      case 'sakura-wall':wall(0,0,3.6,.85,1.95);break;
      case 'sakura-bench':wall(0,0,2.3,.85,.9);break;
      case 'sakura-shrine':
        for(let x=-2.8;x<=2.81;x+=.7)for(let z=-2.1;z<=2.11;z+=.7)add(x,z,.51,4.9);
        wall(0,-2.7,2.3,.8,.5);break;
      case 'sakura':add(0,0,.55,4.5);break;
      case 'jungle-tree':add(0,0,.38,4.5);break;
      case 'pine':if(theme!=='frozen'||Math.hypot(p.x,p.z)<FROZEN_RADIUS+4)add(0,0,.27,theme==='forest'?8.25:5);break;
      // One trunk disc; forest boundary snags beyond the arena edge need none.
      case 'dead-pine':if(theme!=='forest'||Math.hypot(p.x,p.z)<FOREST_RADIUS)add(0,0,.34,7.7);break;
      case 'rock-boulder':add(0,0,1.15,1.8);add(-.9,.55,.4,.5);break;
      case 'rock-flat':wall(0,0,.8,1.45,.65);break;
      case 'cliff-face':wall(0,0,2.5,1.8,3.3);break;
      case 'wall-broken':wall(0,0,1.6,.52,1.35);break;
      case 'cover-crate':wall(0,0,.65,1.3,1.25);break;
      case 'cover-barrel':add(0,0,.46,1.2);break;
      case 'cover-barrier':wall(0,0,1.4,.85,1.1);break;
      case 'cover-scrap':wall(0,0,.8,.9,.65);break;
      case 'log-fallen':wall(0,0,2.1,.6,.65,true);break;
      case 'cover-timber':wall(0,0,1.9,1.35,.95,true);break;
      case 'ruin':
        add(-1.2,0,.35,3.2);add(1.2,0,.35,3.2);
        wall(-1.2,1.2,1.8,.48,2.3,true);add(1.4,.4,.55,1.6);break;
      case 'fallen-column':wall(0,0,8,2.6,2.6,true);wall(0,5.2,1.6,3.1,.5);break;
      // Loose pebbles, surface patches and soft vegetation are walk-through.
    }
  }
  return out;
}
/** Earliest swept contact against finite-height solid cover, including vertical shots. */
export function traceScenery(obstacles:readonly SceneryObstacle[],from:Point3,to:Point3,pad=0):number|null {
  let first=Infinity;
  const dx=to.x-from.x,dz=to.z-from.z,dy=to.y-from.y,a=dx*dx+dz*dz;
  for(const o of obstacles){
    const ox=from.x-o.x,oz=from.z-o.z,r=o.r+pad,c=ox*ox+oz*oz-r*r;
    let enter=0,exit=1;
    if(a<1e-12){if(c>0)continue;}else{
      const b=ox*dx+oz*dz,d=b*b-a*c;if(d<0)continue;
      enter=Math.max(enter,(-b-Math.sqrt(d))/a);exit=Math.min(exit,(-b+Math.sqrt(d))/a);
    }
    if(Math.abs(dy)<1e-12){if(from.y< -pad||from.y>o.height+pad)continue;}else{
      const t0=(-pad-from.y)/dy,t1=(o.height+pad-from.y)/dy;
      enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
    }
    if(enter<=exit&&enter<first)first=enter;
  }
  return Number.isFinite(first)?first:null;
}
