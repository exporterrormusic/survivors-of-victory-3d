import type { GroundObstacle } from '../navigation';
import { rangePlacements, type RangeEnvironment } from './range-environments';

export interface SceneryObstacle extends GroundObstacle { height:number }
interface Point3 { x:number;y:number;z:number }
/** Stable, inexpensive solid footprints, separate from foliage cards and wind. */
export function rangeObstacles(theme:RangeEnvironment):SceneryObstacle[] {
  const out:SceneryObstacle[]=[];
  for(const p of rangePlacements(theme)){
    const add=(x:number,z:number,r:number,height:number)=>out.push({
      x:p.x+(Math.cos(p.yaw)*x+Math.sin(p.yaw)*z)*p.scale,
      z:p.z+(-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z)*p.scale,r:r*p.scale,height:height*p.scale});
    // Overlapping discs form capsule walls; openings remain actual openings.
    const wall=(x:number,z:number,length:number,width:number,height:number,alongZ=false)=>{
      const n=Math.max(1,Math.ceil(length/(width*.65)));
      for(let i=0;i<=n;i++){const t=-length/2+i*length/n;add(x+(alongZ?0:t),z+(alongZ?t:0),width*.55,height);}
    };
    switch(p.asset){
      case 'sakura':add(0,0,.55,4.5);break;
      case 'jungle-tree':add(0,0,.38,4.5);break;
      case 'pine':add(0,0,.27,5);break;
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
