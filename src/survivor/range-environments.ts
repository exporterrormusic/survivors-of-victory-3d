import type { FrozenAsset } from './frozen-assets';
import { OUTSKIRTS_CRATER, outskirtsGrove } from './outskirts-landmarks.ts';
/** Test Range art palettes, based on GAME_PLAN §5 and S02 / Z02–Z05.
 * These are visual staging layouts, not the future 160 m gameplay sectors. */
import { sakuraPlacements } from './sakura-layout.ts';
import { frozenPlacements } from './frozen-layout.ts';
export { FROZEN_RADIUS } from './frozen-layout.ts';
import type { SakuraAsset } from './sakura-assets.ts';
import { CITY_ASSETS, cityPlacements, type CityAsset } from './city-layout.ts';
import { stormPlacements } from './storm-layout.ts';
import { forestPlacements } from './forest-layout.ts';
import type { ForestAsset } from './forest-kit.ts';
export const RANGE_ENVIRONMENTS = {
  forest: 'Haunted Pine Forest', plain: 'Undressed test range', outskirts: 'Ark Outskirts', sakura: 'Sakura Grove', frozen: 'The Frozen North',
  city: 'Grey Ruins', storm: 'Stormbringer', volcano: 'Ashen Caldera',
} as const;
export type RangeEnvironment = keyof typeof RANGE_ENVIRONMENTS;
/** Outskirts is 50% wider; props retain their authored physical sizes. */
export const OUTSKIRTS_SCALE = 1.5;
export const RANGE_MOODS = {
  forest: {time:'night',weather:'fog',snow:'off',water:'off'},
  plain: {time:'day',weather:'clear',snow:'off',water:'off'},
  outskirts: {time:'day',weather:'clear',snow:'off',water:'off'},
  sakura: {time:'day',weather:'petals',snow:'off',water:'off'},
  frozen: {time:'day',weather:'snow',snow:'powder',water:'off'},
  city: {time:'day',weather:'overcast',snow:'off',water:'off'},
  storm: {time:'night',weather:'storm',snow:'off',water:'auto'},
  volcano: {time:'day',weather:'clear',snow:'off',water:'off'},
} as const;
export function rangeEnvironmentForZone(zone: string | null): RangeEnvironment {
  if(zone==='forest'||zone==='haunted-forest')return 'forest';
  if(zone?.startsWith('volcano'))return 'volcano';
  if(zone?.startsWith('sakura'))return 'sakura';
  if(zone?.startsWith('snow'))return 'frozen';
  if(zone==='storm'||zone==='stormbringer')return 'storm';
  if(zone==='grey-ruins'||zone==='grey_ruins'||zone==='city'||zone?.startsWith('city_')||zone==='dead_city'||zone==='dead-city')return 'city';
  if(zone==='hollow'||zone?.startsWith('hollow_')||zone==='the_hollow')return 'city';
  return 'outskirts';
}
export type RangeProp = ForestAsset|FrozenAsset|SakuraAsset|CityAsset|'rock-pebbles'|'rock-boulder'|'rock-flat'|'cliff-face'|'wall-broken'|'cover-barrier'|'cover-crate'|'cover-barrel'|'cover-scrap'|'patch-dirt'|'patch-gravel'|'patch-moss'|'plant-grass'|'plant-bush'|'plant-fern'|'plant-reeds'|'log-fallen'|'cover-timber'|'dead-pine'|'sakura'|'pine'|'jungle-tree'|'ruin'|'fallen-column';
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
export interface RangePlacement { asset:RangeProp;x:number;z:number;scale:number;yaw:number;
  /** Decoration you walk over (ford stepping stones): no collision. */
  walkable?:boolean }
// Visual envelopes, not just trunk/collision radii. Include foliage cards, roots,
// asymmetric rubble and wind sway; circles remain safe at every placement yaw.
const PROP_RADIUS:Record<RangeProp,number>={
 'frozen-mountain':25,'frozen-hangar':11,'frozen-relay':10,'frozen-outcrop':6,'frozen-barrier':2,'frozen-beacon':.6,
  'forest-lamp':.8,'forest-lychgate':4.3,'forest-chapel':6.5,'forest-grave':.9,'forest-cross':.9,'forest-fence':1.7,
  'forest-menhir':.9,'forest-altar':1.6,'forest-cabin':4.2,'forest-woodpile':1.8,'forest-well':1.3,'forest-thorn':1.1,'forest-jack-o-lantern':.6,'forest-vapaus-vial':.025,
  'sakura-roofed-gate':8.2,'sakura-torii':7,'sakura-lantern':1,'sakura-shrine':4.9,'sakura-wall':2.5,'sakura-bench':1.6,
  'rock-pebbles':1.1,'rock-boulder':1.55,'rock-flat':1.4,'cliff-face':2.6,
  'wall-broken':1.25,'cover-barrier':1.2,'cover-crate':1,'cover-barrel':.5,
  'cover-scrap':1.5,'patch-dirt':1.7,'patch-gravel':1.7,'patch-moss':1.7,
  'plant-grass':.75,'plant-bush':1.7,'plant-fern':1.4,'plant-reeds':1,
  'log-fallen':1.5,'cover-timber':1.7,sakura:5.5,pine:3,'jungle-tree':4.4,
  ruin:3,'fallen-column':7,'dead-pine':2.2,
  ...Object.fromEntries(Object.entries(CITY_ASSETS).map(([key,a])=>[key,Math.hypot(a.width,a.depth)/2])) as Record<CityAsset,number>,
};
export const RANGE_PROP_GAP=.75;
export function rangePropRadius(p:Pick<RangePlacement,'asset'|'scale'>):number{
  return PROP_RADIUS[p.asset]*p.scale;
}
export function rangePlantNeedsRoadClearance(p:Pick<RangePlacement,'asset'|'scale'>):boolean{
  const plant=p.asset.startsWith('plant-')||['sakura','jungle-tree','pine','dead-pine'].includes(p.asset);
  // Only genuinely tiny tufts may grow in paving cracks, not the fern-sized grass sprays.
  return plant&&!(p.asset==='plant-grass'&&p.scale<=.4);
}
/** Props with solid collision (range-collision.ts). Loose pebbles, ground patches and plants are walk-through. */
export function rangePropCollides(asset:RangeProp):boolean{
  return !(asset==='forest-vapaus-vial'||asset==='rock-pebbles'||asset.startsWith('patch-')||asset.startsWith('plant-'));
}
/** Whether a prop of `radius` at (x, z) reaches onto the main or cross road (feathered edge included). */
export function rangeOnRoad(x:number,z:number,radius:number):boolean{
  return Math.abs(x)<RANGE_ROADS.mainOuter+RANGE_ROADS.edgeNoiseMax*.30+radius
    ||Math.abs(z-RANGE_ROADS.crossZ)<RANGE_ROADS.crossOuter+RANGE_ROADS.edgeNoiseMax*.35+radius;
}
/**
 * Every map's props. The roads are kept clear of anything solid (decorations may stay), so the
 * roadway is always walkable; the lift is not a placed prop and is unaffected.
 */
/** Ashen Caldera: lava-rock outcrops and charred snags, kept off the lift pad and the main lanes. */
function volcanoPlacements():RangePlacement[] {
  const list:RangePlacement[]=[];
  let seed=29;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Stay well inside the lava moat (shore radius ~44.4..46.6) so nothing stands in it.
  const edge=Math.min(ARENA_EDGE_VOLCANO-4,39);
  for(let i=0;i<46;i++){
    const a=random()*Math.PI*2,r=14+Math.sqrt(random())*(edge-14);
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(rangeTreeRoadClearance(x,z)<1.5)continue;
    const pick=random();
    let asset:RangeProp=pick<.45?'rock-boulder':pick<.7?'rock-flat':pick<.85?'cliff-face':'dead-pine';
    // Outer rocks become dead trees in the advancing lava's path, so they burn when it reaches them.
    if(r>31&&asset!=='dead-pine'&&asset!=='cliff-face'&&list.filter(q=>q.asset==='dead-pine'&&Math.hypot(q.x,q.z)>31).length<6)asset='dead-pine';
    const scale=asset==='cliff-face'?.9+random()*.5:asset==='dead-pine'?.9+random()*.3:.9+random()*.7;
    const p={asset,x,z,scale,yaw:random()*Math.PI*2};
    if(list.some(q=>Math.hypot(q.x-x,q.z-z)<rangePropRadius(q)+rangePropRadius(p)+1.5))continue;
    list.push(p);
  }
  return list;
}
/** Ashen Caldera's movement radius matches Ark Outskirts'. */
export const ARENA_EDGE_VOLCANO=34*OUTSKIRTS_SCALE;
export function rangePlacements(theme:RangeEnvironment):RangePlacement[] {
  // Sakura has open portals and a road terminating in a shrine court. A circular
  // prop filter would delete both gates despite their posts being off the road.
  // Its authored routes are checked against the actual collision footprints.
  if(theme==='sakura')return sakuraPlacements();
  if(theme==='storm')return stormPlacements();
  if(theme==='frozen')return frozenPlacements();
  if(theme==='forest')return forestPlacements();
  if(theme==='volcano')return volcanoPlacements();
  if(theme==='outskirts')return [...placementsFor(theme).filter(p=>
    Math.hypot(p.x-OUTSKIRTS_CRATER.x,p.z-OUTSKIRTS_CRATER.z)>OUTSKIRTS_CRATER.scorchRadius+rangePropRadius(p)+2
    &&Math.hypot(p.x+29,p.z-29)>13),...outskirtsGrove()];
  return placementsFor(theme).filter(p=>p.asset!=='ruin'&&(!rangePropCollides(p.asset)||!rangeOnRoad(p.x,p.z,solidRadius(p))));
}
/** The solid footprint, smaller than the visual envelope: tree trunks, not their canopies. */
function solidRadius(p:RangePlacement):number{
  const trunk:Partial<Record<RangeProp,number>>={sakura:.55,'jungle-tree':.38,pine:.27,'dead-pine':.45};
  const t=trunk[p.asset];
  return t===undefined?rangePropRadius(p):t*p.scale;
}
function placementsFor(theme:RangeEnvironment):RangePlacement[] {
  if(theme==='plain')return [];
  if(theme==='city')return cityPlacements();
  const list:RangePlacement[]=[];
  const forest=theme==='outskirts';
  const layoutScale=theme==='outskirts'?OUTSKIRTS_SCALE:1;
  const put=(asset:RangeProp,x:number,z:number,scale=1,yaw=0)=>{
    // Outskirts is a meadow: retain only trees and bushes. Grass is shader-grown.
    if(theme==='outskirts'&&asset!=='jungle-tree'&&asset!=='plant-bush')return;
    x*=layoutScale;z*=layoutScale;
    // Reserve root spread plus sway clearance, including perimeter trees.
    if(forest&&(asset==='sakura'||asset==='jungle-tree'))[x,z]=roadsidePoint(x,z,2*scale+.5);
    const radius=rangePropRadius({asset,scale});
    const fits=(px:number,pz:number)=>{
      // Keep the whole prop outside the spawn/lift area and inside the scenery belt.
      if(Math.hypot(px,pz)<8+radius||Math.hypot(px,pz)+radius>46*layoutScale)return false;
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
    if(theme==='outskirts'){
      put('jungle-tree',x,z,.78+(i%3)*.10,yaw);
      put('wall-broken',x+2,z+1,1.1,yaw);put('plant-bush',x-1.6,z-1,1.3);put('plant-fern',x+1.2,z-2,1.25,yaw);
      put('plant-grass',x+1,z-1,1.1);put(i%2?'rock-flat':'cover-crate',x+2.6,z-2,1.1,yaw);
      if(i%2===0)put('ruin',x-3,z+3,1,yaw);
    } else if(theme==='frozen'){
      put('pine',x,z,.9+(i%3)*.16,yaw);put('pine',x-2,z+3,.65,yaw+1);
      put('rock-boulder',x+1.7,z-1,1.35,yaw);put('rock-pebbles',x-1,z-2,1.6);
      put(i%2?'cover-barrier':'log-fallen',x+2,z+3,1.3,yaw);
      if(i%3===0)put('cover-crate',x-2,z-2,1.1,yaw);
    } else {
      put('cliff-face',x,z,1.6,yaw);put('cover-scrap',x+2,z-2,1.6,yaw);put('rock-pebbles',x-2,z-1,2,yaw);
      put('wall-broken',x+2,z+2,1.4,yaw);put('patch-gravel',x,z-2,1.5);
    }
  }
  // Distant silhouettes sit beyond the training targets. No central spawn is dressed.
  if(theme==='outskirts')put('fallen-column',-19,29,1,-.8);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,r=35+(i%3)*2;
    put(theme==='frozen'?'pine':'cliff-face',Math.cos(a)*r,Math.sin(a)*r,1.2+(i%3)*.22,a);
  }
  for(let i=0;i<20;i++){
    const a=i*2.399,r=18+(i%4)*3,x=Math.cos(a)*r,z=Math.sin(a)*r;
    put(theme==='outskirts'?'plant-grass':'rock-pebbles',x,z,.7+(i%3)*.25,a);
  }
  return list;
}
