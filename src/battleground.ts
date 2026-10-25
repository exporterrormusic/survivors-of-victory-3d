// Proportional traces of Blizzard's battleground overviews; see docs/BATTLEGROUNDS.md.
// Terrain, collision, minion routes, buildings and minimap share these coordinates.
import type { GroundPoint, GroundObstacle } from './navigation';
// Scale travel distances independently of heroes/buildings; do not enlarge the models.
export const MAP_SCALE = 1.8;
export const MAP_EXTENT = 120;
export const BATTLEGROUNDS = {
  'three-lane': { name: 'Outpost Hollow', description: '3 lanes · Cursed Hollow layout' },
  'single-lane': { name: 'Lost Outpost', description: '1 lane · Lost Cavern layout' },
} as const;
export type BattlegroundId = keyof typeof BATTLEGROUNDS;
const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('map');
export const MAP_ID: BattlegroundId = requested === 'single-lane' ? 'single-lane' : 'three-lane';
export const BATTLEGROUND = BATTLEGROUNDS[MAP_ID];
export type LaneId = 'top' | 'mid' | 'bottom';
export interface Lane { id: LaneId; name: string; width: number; points: GroundPoint[] }
const hollow = (x:number,y:number):GroundPoint=>({x:(x-912)*.07*MAP_SCALE,z:(684-y)*.07*MAP_SCALE});
const cavern = (x:number,y:number):GroundPoint=>({x:(x-600)*.11*MAP_SCALE,z:(250-y)*.11*MAP_SCALE});
const trace = (fn:typeof hollow,pairs:number[][]):GroundPoint[]=>pairs.map(([x,y])=>fn(x,y));
const single = MAP_ID === 'single-lane';
export const BASE_POINTS = single ? {blue:cavern(250,252),red:cavern(950,252)} : {blue:hollow(310,716),red:hollow(1513,643)};
export const SPAWN_POINTS = single ? {blue:cavern(190,178),red:cavern(1015,318)} : {blue:hollow(205,802),red:hollow(1620,560)};
export const LANES:readonly Lane[] = single ? [
  {id:'mid',name:'Mid',width:8,points:trace(cavern,[[250,252],[380,249],[515,232],[600,248],[686,267],[820,248],[950,252]])},
] : [
  {id:'top',name:'Top',width:7.5,points:trace(hollow,[[310,716],[315,620],[405,480],[535,355],[680,280],[765,220],[875,205],[1005,190],[1095,210],[1220,300],[1392,415],[1470,555],[1513,643]])},
  {id:'mid',name:'Mid',width:8,points:trace(hollow,[[310,716],[450,730],[535,704],[690,735],[775,680],[920,680],[1060,680],[1158,710],[1300,675],[1380,730],[1513,643]])},
  {id:'bottom',name:'Bottom',width:7.5,points:trace(hollow,[[310,716],[350,840],[460,945],[575,1080],[745,1160],[830,1172],[950,1145],[1065,1115],[1157,1080],[1300,1000],[1423,862],[1513,748],[1513,643]])},
];
export const JUNGLE_PATHS:readonly GroundPoint[][] = single ? [
  trace(cavern,[[445,240],[470,150],[560,150],[585,190],[660,190],[740,155],[775,230]]),
  trace(cavern,[[430,285],[465,330],[545,330],[585,300],[640,325],[740,335],[770,280]]),
] : [
  trace(hollow,[[535,355],[565,445],[670,428],[790,470],[850,600],[920,680],[930,810],[1050,865],[1155,945],[1300,1000]]),
  trace(hollow,[[460,945],[570,860],[665,860],[750,945],[850,1010],[950,1145]]),
  trace(hollow,[[405,480],[550,510],[650,570],[690,735],[650,840],[575,1080]]),
  trace(hollow,[[765,220],[810,330],[930,340],[990,410],[1080,335],[1220,300]]),
  trace(hollow,[[1392,415],[1280,400],[1205,490],[1158,710],[1200,800],[1423,862]]),
  trace(hollow,[[680,280],[670,428],[790,400],[930,340],[940,205]]),
  trace(hollow,[[535,704],[650,570],[790,470],[930,520],[1060,680],[1050,865],[930,950],[830,1172]]),
  trace(hollow,[[775,680],[780,805],[930,810],[1055,760],[1200,800],[1300,675]]),
];
export const MAP_BOUNDARY:readonly GroundPoint[] = single
  ? trace(cavern,[[100,205],[100,130],[165,85],[290,95],[340,160],[470,165],[520,130],[650,135],[690,165],[825,170],[870,125],[990,115],[1040,160],[1060,225],[1120,310],[1100,385],[1010,400],[950,355],[810,340],[770,375],[680,365],[640,330],[550,325],[505,370],[395,365],[345,330],[220,350],[145,310]])
  : trace(hollow,[[90,930],[90,775],[145,685],[175,530],[330,450],[435,315],[550,240],[635,170],[790,155],[920,150],[995,105],[1100,115],[1220,180],[1280,275],[1380,320],[1535,365],[1660,400],[1740,480],[1720,590],[1680,680],[1665,795],[1600,890],[1480,960],[1370,1035],[1250,1130],[1120,1205],[1020,1200],[895,1245],[820,1280],[705,1230],[580,1170],[475,1110],[415,1030],[280,1035],[190,980]]);
export function pathLength(path:readonly GroundPoint[]):number {
  return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);
}
export function pathPoint(path:readonly GroundPoint[],along:number):GroundPoint {
  let left=Math.max(0,along);
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(left<=length)return {x:a.x+(b.x-a.x)*left/length,z:a.z+(b.z-a.z)*left/length};
    left-=length;
  }
  return {...path[path.length-1]};
}
export function distanceToPath(p:GroundPoint,path:readonly GroundPoint[]):number {
  let best=Infinity;
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));
  }
  return best;
}
export function onRoad(p:GroundPoint,margin=0):boolean {
  return LANES.some(l=>distanceToPath(p,l.points)<l.width/2+margin)
    || JUNGLE_PATHS.some(path=>distanceToPath(p,path)<2.2+margin)
    || Object.values(BASE_POINTS).some(b=>Math.hypot(p.x-b.x,p.z-b.z)<10+margin)
    || Object.values(SPAWN_POINTS).some(b=>Math.hypot(p.x-b.x,p.z-b.z)<5+margin);
}
/** All painted paving, including feathered/noisy shoulders, base approaches and courts. */
export function onPlantingRoad(p:GroundPoint,radius=0):boolean {
  const margin=radius+2.2;
  return onRoad(p,margin)
    || COMPOUNDS.some(c=>Math.hypot(p.x-c.building.x,p.z-c.building.z)<4.5+margin)
    || (['blue','red'] as const).some(team=>distanceToPath(p,[SPAWN_POINTS[team],BASE_POINTS[team]])<4.5+margin);
}
const coverPoints = single ? trace(cavern,[[575,202],[630,205],[560,287],[620,295],[450,180],[752,307]])
  : trace(hollow,[[540,550],[590,570],[610,355],[680,350],[750,335],[690,485],[755,540],[800,545],[865,450],[915,280],[1085,285],[1135,325],[1100,385],[1055,445],[1190,560],[1240,575],[1280,580],[1340,520],[565,810],[620,775],[685,785],[720,820],[805,865],[785,930],[680,945],[640,1000],[720,1060],[800,1090],[900,1080],[885,955],[1000,920],[1030,815],[1100,805],[1225,870],[1240,960],[1165,1005]]);
export const MAP_COVER:readonly GroundObstacle[] = coverPoints.map((p,i)=>({...p,r:single?2.6:3.3+(i%3)*.4}));
export type StructureKind = 'tower'|'fort'|'keep'|'gate'|'core';
export interface StructureSite extends GroundPoint {
  id:string; team:'blue'|'red'; kind:StructureKind; lane?:LaneId; tier?:'outer'|'inner'; yaw?:number;
}
interface Compound {team:'blue'|'red';lane:LaneId;tier:'outer'|'inner';building:GroundPoint;gate:GroundPoint;yaw:number}
const compound=(team:Compound['team'],lane:LaneId,tier:Compound['tier'],bx:number,by:number,gx:number,gy:number,yaw:number):Compound=>({team,lane,tier,building:(single?cavern:hollow)(bx,by),gate:(single?cavern:hollow)(gx,gy),yaw});
export const COMPOUNDS:readonly Compound[] = single ? [
  compound('blue','mid','inner',335,280,380,249,Math.PI/2),
  compound('blue','mid','outer',465,202,515,232,Math.PI/2+.2),
  compound('red','mid','outer',735,295,686,267,-Math.PI/2+.2),
  compound('red','mid','inner',865,220,820,248,-Math.PI/2),
] : [
  compound('blue','top','inner',330,560,405,480,Math.PI/4),
  compound('blue','mid','inner',450,680,535,704,Math.PI/2),
  compound('blue','bottom','inner',385,870,460,945,Math.PI*.75),
  compound('blue','top','outer',680,240,765,220,Math.PI/2-.22),
  compound('blue','mid','outer',690,694,775,680,Math.PI/2),
  compound('blue','bottom','outer',749,1200,830,1172,Math.PI/2-.22),
  compound('red','top','outer',1087,160,1005,190,-Math.PI/2-.22),
  compound('red','mid','outer',1158,660,1060,680,-Math.PI/2),
  compound('red','bottom','outer',1157,1125,1065,1115,-Math.PI/2-.22),
  compound('red','top','inner',1443,490,1392,415,-Math.PI*.75),
  compound('red','mid','inner',1380,680,1300,675,-Math.PI/2),
  compound('red','bottom','inner',1505,808,1423,862,-Math.PI/4),
];
export const GATE_HALF_WIDTH=3.45;
export const structureRadius=(kind:StructureKind):number=>kind==='core'?3.2:kind==='fort'?2.05:kind==='keep'?2.4:kind==='gate'?.8:1.05;
export const STRUCTURE_SITES:readonly StructureSite[] = [
  ...COMPOUNDS.flatMap(c=>{
    const kind=c.tier==='inner'?'keep':'fort',id=`${c.team}-${c.lane}-${kind}`;
    return [
      {id,team:c.team,kind,lane:c.lane,tier:c.tier,...c.building,yaw:c.yaw} as StructureSite,
      ...([-1,1] as const).map((side,i)=>({id:`${id}-tower-${i+1}`,team:c.team,kind:'tower' as const,lane:c.lane,tier:c.tier,x:c.gate.x+Math.cos(c.yaw)*GATE_HALF_WIDTH*side,z:c.gate.z-Math.sin(c.yaw)*GATE_HALF_WIDTH*side,yaw:c.yaw})),
      {id:`${id}-gate`,team:c.team,kind:'gate' as const,lane:c.lane,tier:c.tier,...c.gate,yaw:c.yaw},
    ];
  }),
  ...(['blue','red'] as const).map(team=>({id:`${team}-core`,team,kind:'core' as const,...BASE_POINTS[team]})),
];
