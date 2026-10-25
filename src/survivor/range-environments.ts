/** Test Range art palettes, based on GAME_PLAN §5 and S02 / Z02–Z05.
 * These are visual staging layouts, not the future 160 m gameplay sectors. */
export const RANGE_ENVIRONMENTS = {
  plain: 'Undressed test range', outskirts: 'Ark Outskirts', sakura: 'Sakura Grove', frozen: 'The Frozen North',
  city: 'Dead City', storm: 'Stormbringer', hollow: 'The Hollow',
} as const;
export type RangeEnvironment = keyof typeof RANGE_ENVIRONMENTS;
export const RANGE_MOODS = {
  plain: {time:'day',weather:'clear',snow:'off',water:'off'},
  outskirts: {time:'day',weather:'clear',snow:'off',water:'off'},
  sakura: {time:'day',weather:'petals',snow:'off',water:'off'},
  frozen: {time:'day',weather:'snow',snow:'powder',water:'off'},
  city: {time:'dusk',weather:'clear',snow:'off',water:'off'},
  storm: {time:'night',weather:'storm',snow:'off',water:'auto'},
  hollow: {time:'night',weather:'clear',snow:'off',water:'off'},
} as const;
export function rangeEnvironmentForZone(zone: string | null): RangeEnvironment {
  if(zone?.startsWith('sakura'))return 'sakura';
  if(zone?.startsWith('snow'))return 'frozen';
  if(zone==='storm'||zone==='stormbringer')return 'storm';
  if(zone==='city'||zone==='dead_city'||zone==='dead-city')return 'city';
  if(zone==='hollow'||zone==='the_hollow')return 'hollow';
  return 'outskirts';
}
export type RangeProp = 'rock-pebbles'|'rock-boulder'|'rock-flat'|'cliff-face'|'wall-broken'|'cover-barrier'|'cover-crate'|'cover-barrel'|'cover-scrap'|'patch-dirt'|'patch-gravel'|'patch-moss'|'plant-grass'|'plant-bush'|'plant-fern'|'plant-reeds'|'log-fallen'|'cover-timber'|'sakura'|'pine'|'jungle-tree'|'ruin'|'fallen-column';
// Match the world-space roads painted by RangeGround. Include their feathered
// edges and the maximum procedural edge displacement when reserving planting space.
export const RANGE_ROADS = {mainInner:4,mainOuter:5.4,crossInner:3,crossOuter:4.6,crossZ:-7,edgeNoiseMax:1.2} as const;
export function rangeTreeRoadClearance(x:number,z:number):number {
  return Math.min(Math.abs(x)-(RANGE_ROADS.mainOuter+RANGE_ROADS.edgeNoiseMax*.30),
    Math.abs(z-RANGE_ROADS.crossZ)-(RANGE_ROADS.crossOuter+RANGE_ROADS.edgeNoiseMax*.35));
}
function roadsidePoint(x:number,z:number,margin:number):[number,number] {
  const main=RANGE_ROADS.mainOuter+RANGE_ROADS.edgeNoiseMax*.30+margin;
  const cross=RANGE_ROADS.crossOuter+RANGE_ROADS.edgeNoiseMax*.35+margin;
  return [(x<0?-1:1)*Math.max(Math.abs(x),main),
    RANGE_ROADS.crossZ+(z<RANGE_ROADS.crossZ?-1:1)*Math.max(Math.abs(z-RANGE_ROADS.crossZ),cross)];
}
export interface RangePlacement { asset:RangeProp;x:number;z:number;scale:number;yaw:number }
// Visual envelopes, not just trunk/collision radii. Include foliage cards, roots,
// asymmetric rubble and wind sway; circles remain safe at every placement yaw.
const PROP_RADIUS:Record<RangeProp,number>={
  'rock-pebbles':1.1,'rock-boulder':1.55,'rock-flat':1.4,'cliff-face':2.6,
  'wall-broken':1.25,'cover-barrier':1.2,'cover-crate':1,'cover-barrel':.5,
  'cover-scrap':1.5,'patch-dirt':1.7,'patch-gravel':1.7,'patch-moss':1.7,
  'plant-grass':.75,'plant-bush':1.7,'plant-fern':1.4,'plant-reeds':1,
  'log-fallen':1.5,'cover-timber':1.7,sakura:5.5,pine:3,'jungle-tree':4.4,
  ruin:3,'fallen-column':7,
};
export const RANGE_PROP_GAP=.75;
export function rangePropRadius(p:Pick<RangePlacement,'asset'|'scale'>):number{
  return PROP_RADIUS[p.asset]*p.scale;
}
export function rangePlantNeedsRoadClearance(p:Pick<RangePlacement,'asset'|'scale'>):boolean{
  const plant=p.asset.startsWith('plant-')||['sakura','jungle-tree','pine'].includes(p.asset);
  // Only genuinely tiny tufts may grow in paving cracks, not the fern-sized grass sprays.
  return plant&&!(p.asset==='plant-grass'&&p.scale<=.4);
}
export function rangePlacements(theme:RangeEnvironment):RangePlacement[] {
  if(theme==='plain')return [];
  const list:RangePlacement[]=[];
  const forest=theme==='outskirts'||theme==='sakura'||theme==='storm';
  const put=(asset:RangeProp,x:number,z:number,scale=1,yaw=0)=>{
    // Reserve root spread plus sway clearance, including perimeter trees.
    if(forest&&(asset==='sakura'||asset==='jungle-tree'))[x,z]=roadsidePoint(x,z,2*scale+.5);
    const radius=rangePropRadius({asset,scale});
    const fits=(px:number,pz:number)=>{
      // Keep the whole prop outside the spawn/lift area and inside the scenery belt.
      if(Math.hypot(px,pz)<8+radius||Math.hypot(px,pz)+radius>46)return false;
      if(rangePlantNeedsRoadClearance({asset,scale})&&rangeTreeRoadClearance(px,pz)<radius+.5)return false;
      return list.every(p=>Math.hypot(px-p.x,pz-p.z)>=radius+rangePropRadius(p)+RANGE_PROP_GAP);
    };
    if(fits(x,z)){list.push({asset,x,z,scale,yaw});return;}
    // Search outward locally and deterministically. If the neighborhood is full,
    // omit the detail instead of forcing an overlap or moving it across the map.
    for(let ring=1;ring<=12;ring++){
      const distance=ring,steps=Math.ceil(2*Math.PI*distance/.8);
      for(let i=0;i<steps;i++){
        const angle=yaw+ring*2.399+i*Math.PI*2/steps;
        const px=x+Math.cos(angle)*distance,pz=z+Math.sin(angle)*distance;
        if(fits(px,pz)){list.push({asset,x:px,z:pz,scale,yaw});return;}
      }
    }
  };
  const anchors=[[-11,6],[12,8],[-13,-10],[15,-11],[-22,20],[22,21],[-12,27],[16,-26]];
  for(const [i,anchor] of anchors.entries()){
    // Move the entire grove cluster together so bushes/ruins stay with its tree.
    const [x,z]=forest?roadsidePoint(anchor[0],anchor[1],4):anchor;
    const yaw=i*2.399;
    if(theme==='outskirts'||theme==='sakura'){
      put(theme==='sakura'?'sakura':'jungle-tree',x,z,.78+(i%3)*.10,yaw);
      put('wall-broken',x+2,z+1,1.1,yaw);put('plant-bush',x-1.6,z-1,1.3);put('plant-fern',x+1.2,z-2,1.25,yaw);
      put('plant-grass',x+1,z-1,1.1);put(i%2?'rock-flat':'cover-crate',x+2.6,z-2,1.1,yaw);
      if(i%2===0)put('ruin',x-3,z+3,1,yaw);
    } else if(theme==='frozen'){
      put('pine',x,z,.9+(i%3)*.16,yaw);put('pine',x-2,z+3,.65,yaw+1);
      put('rock-boulder',x+1.7,z-1,1.35,yaw);put('rock-pebbles',x-1,z-2,1.6);
      put(i%2?'cover-barrier':'log-fallen',x+2,z+3,1.3,yaw);
      if(i%3===0)put('cover-crate',x-2,z-2,1.1,yaw);
    } else if(theme==='city'){
      put('ruin',x,z,1.6,yaw);put('wall-broken',x+2,z+1,1.4,yaw);put('cover-barrier',x-2,z-2,1.4,yaw);
      put('cover-scrap',x+1,z-2,1.6,yaw);put('cover-barrel',x+2.2,z-2,1.1);put('cover-crate',x-2,z+1,1.25);
      put('plant-grass',x-1,z-2.5,1.2);put('patch-gravel',x,z-1,1.5);
    } else if(theme==='storm'){
      put('jungle-tree',x,z,.95+(i%2)*.25,yaw);put('plant-bush',x-2,z-1,1.8);put('plant-fern',x+2,z-2,1.8,yaw);
      put('plant-fern',x-1,z-3,1.5,yaw+2);put('log-fallen',x+2,z+2,1.3,yaw);put('plant-grass',x,z-1,1.4);
      if(i%2===0){put('ruin',x+3,z+3,1.1,yaw);put('cover-crate',x+2.5,z-2,1.1);}
    } else {
      put('cliff-face',x,z,1.6,yaw);put('cover-scrap',x+2,z-2,1.6,yaw);put('rock-pebbles',x-2,z-1,2,yaw);
      put('wall-broken',x+2,z+2,1.4,yaw);put('patch-gravel',x,z-2,1.5);
    }
  }
  // Distant silhouettes sit beyond the training targets. No central spawn is dressed.
  if(theme==='hollow')put('fallen-column',-6,29,1.4,-.4);
  if(theme==='outskirts'||theme==='sakura'||theme==='city')put('fallen-column',-19,29,1,-.8);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,r=35+(i%3)*2;
    put(theme==='storm'?'jungle-tree':theme==='frozen'?'pine':'cliff-face',Math.cos(a)*r,Math.sin(a)*r,1.2+(i%3)*.22,a);
  }
  for(let i=0;i<20;i++){
    const a=i*2.399,r=18+(i%4)*3,x=Math.cos(a)*r,z=Math.sin(a)*r;
    put(theme==='outskirts'||theme==='sakura'||theme==='storm'?'plant-grass':'rock-pebbles',x,z,.7+(i%3)*.25,a);
  }
  return list;
}
