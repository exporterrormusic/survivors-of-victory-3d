/** Stormbringer's authoritative river geometry and crossing decisions (renderer independent).
 * The falls feed a short trunk in the north that forks into a west and an east branch.
 * The branches run down either side at different angles and spill into a deep southern lake,
 * dividing the valley into three regions: west bank (0), central island (1), east bank (2). */
export interface StormPoint { x:number; z:number }
export const STORM_RADIUS=72;
/** Lift on the central island. Dry at full flood. */
export const STORM_ARRIVAL={x:4,z:-10};
export const STORM_BANK_BLEND=3.2;
/** Metres the river spreads onto each bank at full surge. */
export const STORM_FLOOD_SPREAD=2.5;
/** Where the trunk forks. */
export const STORM_SPLIT_Z=40;
const BRANCH_END=-76,TRUNK_HALF=9.5;
const trunkX=(z:number)=>8+4*Math.sin(z/18);
const BASE=trunkX(STORM_SPLIT_Z);
const ease=(t:number,k:number)=>(1-Math.exp(-k*t))/(1-Math.exp(-k));
const along=(z:number)=>Math.max(0,Math.min(1,(STORM_SPLIT_Z-z)/(STORM_SPLIT_Z-BRANCH_END)));
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export type StormChannelId='trunk'|'west'|'east';
export interface StormChannel {id:StormChannelId;zMin:number;zMax:number;center(z:number):number;half(z:number):number;
  /** Regions on the low-x and high-x sides. */
  sides:readonly [number,number]}
/** Each formula has a GLSL twin in `stormChannelGLSL`; keep them in step. */
export const STORM_CHANNELS:readonly StormChannel[]=[
  {id:'trunk',zMin:STORM_SPLIT_Z-8,zMax:400,sides:[0,2],center:trunkX,half:()=>TRUNK_HALF},
  {id:'west',zMin:-400,zMax:STORM_SPLIT_Z+2,sides:[0,1],
    center:z=>{const t=along(z);return BASE-50*ease(t,3)+3.5*Math.sin(z/11+.7)*smooth(0,.25,t)-(z<BRANCH_END?(BRANCH_END-z)*.35:0);},
    half:z=>TRUNK_HALF+(6.2+Math.sin(z/13)-TRUNK_HALF)*smooth(0,.15,along(z))},
  {id:'east',zMin:-400,zMax:STORM_SPLIT_Z+2,sides:[1,2],
    center:z=>{const t=along(z);return BASE+44*ease(t,1.8)+4*Math.sin(z/15+2)*smooth(0,.25,t)+(z<BRANCH_END?(BRANCH_END-z)*.3:0);},
    half:z=>TRUNK_HALF+(7+1.2*Math.sin(z/17+.4)-TRUNK_HALF)*smooth(0,.15,along(z))},
];
export const channelOf=(id:StormChannelId)=>STORM_CHANNELS.find(c=>c.id===id)!;
/** Downstream (toward -z) unit flow of a channel. */
export function channelFlow(c:StormChannel,z:number):StormPoint{
  const slope=(c.center(z+.5)-c.center(z-.5)),n=Math.hypot(slope,1);return {x:-slope/n,z:-1/n};
}
/** GLSL: float stormCenter{N}(float z), float stormHalf{N}(float z) for trunk(0), west(1), east(2). */
export function stormChannelGLSL():string{
  const f=(n:number)=>n.toFixed(4);
  return `
// Fixed erosion at several scales, shared by the bed and water surface.
float stormBankErosion(vec2 p){
 return .55*sin(p.x*.43+sin(p.y*.31)*1.4)+.32*sin(p.y*1.13+p.x*.71)
  +.16*sin(p.x*2.8-p.y*2.1);
}
float stormSoftUnion(float a,float b){float h=max(2.4-abs(a-b),0.)/2.4;return max(a,b)+h*h*.6;}
float stormEase(float t,float k){return (1.-exp(-k*t))/(1.-exp(-k));}
float stormAlong(float z){return clamp((${f(STORM_SPLIT_Z)}-z)/${f(STORM_SPLIT_Z-BRANCH_END)},0.,1.);}
float stormCenter0(float z){return 8.+4.*sin(z/18.);}
float stormHalf0(float z){return ${f(TRUNK_HALF)};}
float stormCenter1(float z){float t=stormAlong(z);return ${f(BASE)}-50.*stormEase(t,3.)+3.5*sin(z/11.+.7)*smoothstep(0.,.25,t)-max(0.,${f(BRANCH_END)}-z)*.35;}
float stormHalf1(float z){return mix(${f(TRUNK_HALF)},6.2+sin(z/13.),smoothstep(0.,.15,stormAlong(z)));}
float stormCenter2(float z){float t=stormAlong(z);return ${f(BASE)}+44.*stormEase(t,1.8)+4.*sin(z/15.+2.)*smoothstep(0.,.25,t)+max(0.,${f(BRANCH_END)}-z)*.3;}
float stormHalf2(float z){return mix(${f(TRUNK_HALF)},7.+1.2*sin(z/17.+.4),smoothstep(0.,.15,stormAlong(z)));}
float stormLakeEdge(float x){return ${f(STORM_SHORE_Z)}+4.*sin(x/13.)+3.*sin(x/7.+1.);}
`;
}
/** The deep lake that closes the south of the map. Its north shore wobbles across x;
 * pushed south so a broad beach runs along it, a kiting lane where the river branches spill out. */
export const STORM_SHORE_Z=-60;
export function stormLakeEdge(x:number):number{return STORM_SHORE_Z+4*Math.sin(x/13)+3*Math.sin(x/7+1);}
/** Lake water is too deep to wade quickly: 15% speed once past the shelf. */
export const STORM_LAKE_SPEED=.15;
/** Rocky rapids where a channel runs shallow; the intended crossings. */
export const STORM_SHOALS:readonly {channel:StormChannelId;z:number;half:number}[]=[
  {channel:'trunk',z:58,half:5},
  {channel:'west',z:10,half:5},
  {channel:'west',z:-32,half:5},
  {channel:'east',z:-12,half:5},
];
/** Depth multiplier on a shoal in calm water (full surge closes it completely). */
export const STORM_SHOAL_CALM=.3;
/** The surge makes the river almost a wall: 10% speed at full depth. */
export const STORM_SURGE_SPEED=.1;
/** Optional low ground that floods in a surge (none in the current layout; the lake shore spreads instead). */
export const STORM_FLOODPLAINS:readonly {x:number;z:number;rx:number;rz:number}[]=[];
/** Surge drowning: share of max HP lost per tick at full depth, by combat tier. The horde drowns
 * in a couple of seconds; heavies and bosses are only worn down. The player takes no damage. */
export const STORM_DROWN={interval:.5,share:{horde:.25,specialist:.15,heavy:.06,boss:.02}} as const;
/** Surge lightning on the open east slate: aimed at the densest Rapture pack (3+), damage by tier. */
export const STORM_BOLT={interval:1.4,radius:4,pack:3,share:{horde:.8,specialist:.45,heavy:.15,boss:.04}} as const;
export const STORM_CYCLE={calm:9,warning:6,surge:10,recede:5};
const PERIOD=STORM_CYCLE.calm+STORM_CYCLE.warning+STORM_CYCLE.surge+STORM_CYCLE.recede;
const WARN=STORM_CYCLE.calm,SURGE=WARN+STORM_CYCLE.warning,RECEDE=SURGE+STORM_CYCLE.surge;

const inRange=(c:StormChannel,z:number)=>z>=c.zMin&&z<=c.zMax;
/** Signed metres inside channel c (positive = in water) at the given flood spread. */
const inside=(c:StormChannel,p:StormPoint,spread:number)=>inRange(c,p.z)?Math.min(c.half(p.z)+spread-Math.abs(p.x-c.center(p.z)),p.z-c.zMin,c.zMax-p.z):-Infinity;
const lakeInside=(p:StormPoint,spread:number)=>stormLakeEdge(p.x)+spread-p.z;
/** Channel whose water is nearest (or deepest) at p. */
export function nearestChannel(p:StormPoint):StormChannel{
  let best=STORM_CHANNELS[0],score=-Infinity;
  for(const c of STORM_CHANNELS){const s=inside(c,p,0);if(s>score){score=s;best=c;}}
  return best;
}
/** 0 west bank, 1 central island, 2 east bank. */
export function stormRegion(p:StormPoint):number{
  if(p.z>=STORM_SPLIT_Z)return p.x<trunkX(p.z)?0:2;
  return p.x<STORM_CHANNELS[1].center(p.z)?0:p.x>STORM_CHANNELS[2].center(p.z)?2:1;
}
/** 0 off a shoal, 1 across its middle; feathered over 2 m up and downstream. */
export function shoalAt(c:StormChannel,z:number):number{
  let s=0;for(const h of STORM_SHOALS)if(h.channel===c.id)s=Math.max(s,Math.min(1,Math.max(0,(h.half+1-Math.abs(z-h.z))/2)));
  return s;
}
/** 0 outside, rising to 1 at the flood ground's centre. */
export function floodplainAt(p:StormPoint){
  for(const f of STORM_FLOODPLAINS){
    const e=((p.x-f.x)/f.rx)**2+((p.z-f.z)/f.rz)**2;
    if(e<1)return {plain:f,weight:Math.min(1,(1-e)/.45)};
  }
  return null;
}
/** Flood front travels south from the inlet; the lake is reached about five seconds later.
 * Shared constants/formula keep spray, shading and wading resistance synchronized. */
export const STORM_FRONT_Z=80, STORM_FRONT_SPEED=26, STORM_FRONT_RISE=1.2;
export function stormFloodAt(z:number,age:number):number{
 const delay=Math.max(0,(STORM_FRONT_Z-z)/STORM_FRONT_SPEED);
 return smooth(delay,delay+STORM_FRONT_RISE,age)*(1-smooth(STORM_CYCLE.surge,STORM_CYCLE.surge+STORM_CYCLE.recede,age));
}
export const stormFloodGLSL=`
float stormFloodAt(float z,float age){
 float delay=max(0.,(${STORM_FRONT_Z.toFixed(1)}-z)/${STORM_FRONT_SPEED.toFixed(1)});
 return smoothstep(delay,delay+${STORM_FRONT_RISE.toFixed(1)},age)*(1.-smoothstep(${STORM_CYCLE.surge.toFixed(1)},${(STORM_CYCLE.surge+STORM_CYCLE.recede).toFixed(1)},age));
}`;
interface Body {position:StormPoint;radius:number;alive:boolean}
interface Crossing {shoal:number;lane:number;side:number;stage:number;target:number}
export class StormField {
  enabled=false;
  elapsed=0;
  /** Integrated animation clock; phase changes never rescale past time. */
  flowTime=0;
  private crossings=new WeakMap<object,Crossing>();
  reset(enabled:boolean):void{this.enabled=enabled;this.elapsed=0;this.flowTime=0;this.crossings=new WeakMap();}
  update(dt:number):void{if(this.enabled&&dt>0){this.elapsed+=dt;this.flowTime+=dt;}}
  get phase():'calm'|'warning'|'surge'|'recede'{
    const t=this.elapsed%PERIOD;return t<WARN?'calm':t<SURGE?'warning':t<RECEDE?'surge':'recede';
  }
  get remaining():number{const t=this.elapsed%PERIOD;return (t<WARN?WARN:t<SURGE?SURGE:t<RECEDE?RECEDE:PERIOD)-t;}
  get flood():number{
    const t=this.elapsed%PERIOD;return t<SURGE?0:t<SURGE+1?t-SURGE:t<RECEDE?1:(PERIOD-t)/STORM_CYCLE.recede;
  }
  get surgeAge():number{return this.elapsed%PERIOD-SURGE;}
  floodAt(p:StormPoint):number{return this.enabled?stormFloodAt(p.z,this.surgeAge):0;}
  private inRiver(p:StormPoint,radius=0):boolean{
    const s=STORM_FLOOD_SPREAD*this.floodAt(p)+radius;return lakeInside(p,s)>0||STORM_CHANNELS.some(c=>inside(c,p,s)>0);
  }
  wet(p:StormPoint,radius=0):boolean{
    if(!this.enabled)return false;
    return this.inRiver(p,radius)||(this.floodAt(p)>.05&&!!floodplainAt(p));
  }
  /** Continuous shoreline -> shallows -> channel. Shared by slowing and current. */
  depth(p:StormPoint):number{
    if(!this.wet(p))return 0;
    let river=0;
    for(const c of STORM_CHANNELS){
      const d=inside(c,p,STORM_FLOOD_SPREAD*this.floodAt(p));if(d<=0)continue;
      const t=Math.min(1,d/STORM_BANK_BLEND);
      river=Math.max(river,t*t*(3-2*t)*(1-shoalAt(c,p.z)*(1-STORM_SHOAL_CALM)*(1-this.floodAt(p))));
    }
    const lake=lakeInside(p,STORM_FLOOD_SPREAD*this.floodAt(p));
    if(lake>0){const t=Math.min(1,lake/STORM_BANK_BLEND);river=Math.max(river,t*t*(3-2*t));}
    const meadow=floodplainAt(p);
    return Math.max(river,meadow?meadow.weight*.75*this.floodAt(p):0);
  }
  /** Calm channel 48%; full surge 10%, so the river is almost a wall without trapping anyone.
   * The lake is deep at any time: 15% once past its shelf. */
  speed(p:StormPoint,hover=false):number{
    if(hover)return 1;
    const river=1-(.52+(1-STORM_SURGE_SPEED-.52)*this.floodAt(p))*this.depth(p);
    const lake=lakeInside(p,STORM_FLOOD_SPREAD*this.floodAt(p));
    if(lake<=0)return river;
    const t=Math.min(1,lake/6);return Math.min(river,1-(1-STORM_LAKE_SPEED)*t*t*(3-2*t));
  }
  /** Surge only: downstream drift plus a push toward the nearer bank, so waders wash out. */
  current(p:StormPoint):StormPoint{
    if(this.phase!=='surge'||this.floodAt(p)<=0)return {x:0,z:0};
    const depth=this.depth(p)*this.floodAt(p),c=nearestChannel(p),flow=channelFlow(c,p.z);
    if(!this.inRiver(p))return {x:flow.x*.4*depth,z:flow.z*.4*depth};
    const out=p.x<c.center(p.z)?-1:1;
    return {x:(flow.x*.9+out*.6)*depth,z:flow.z*.9*depth};
  }
  /** Dry ground just past channel c's bank, on the given side, at z. */
  private bank(c:StormChannel,z:number,side:number,r:number):StormPoint{
    const zz=Math.max(c.zMin,Math.min(c.zMax,z));
    return {x:c.center(zz)+side*(c.half(zz)+STORM_FLOOD_SPREAD+r+2),z:zz};
  }
  /** Nearest dry ground: off the flood rim, or up the bank the body is already on. */
  refuge(p:StormPoint,r:number):StormPoint{
    if(lakeInside(p,STORM_FLOOD_SPREAD+r)>0&&!STORM_CHANNELS.some(c=>inside(c,p,STORM_FLOOD_SPREAD+r)>0))
      return {x:p.x,z:stormLakeEdge(p.x)+STORM_FLOOD_SPREAD+r+2};
    const meadow=floodplainAt(p);
    if(meadow&&!this.inRiver(p,r)){
      const f=meadow.plain;let dx=(p.x-f.x)/f.rx,dz=(p.z-f.z)/f.rz;
      if(Math.hypot(dx,dz)<.05){dx=0;dz=1;}
      const n=Math.hypot(dx,dz);
      return {x:f.x+dx/n*(f.rx+r+2),z:f.z+dz/n*(f.rz+r+2)};
    }
    const c=nearestChannel(p);return this.bank(c,p.z,p.x<c.center(p.z)?-1:1,r);
  }
  /** Sample the entire dash/step so fast movers cannot skip the water resistance. */
  travelScale(a:StormPoint,b:StormPoint):number{
    if(!this.enabled)return 1;
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.35));let cost=0;
    for(let i=0;i<=n;i++)cost+=1/this.speed({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n});
    return (n+1)/cost;
  }
  /** Calm water and the warning: committed entry/exit goals route crossings over the best uncrowded
   * shoal (one or two crossings between regions). Raptures ignore the warning, so a horde lured into
   * the river is still wading when the surge lands. Surge: nobody starts a crossing; bodies hold
   * their bank and leave flooded ground. */
  steer(owner:Body,goal:StormPoint,neighbors:readonly Body[],seed:number,hover=false):StormPoint{
    if(!this.enabled||hover)return goal;
    const p=owner.position,r=owner.radius,here=stormRegion(p);
    const danger=this.phase==='surge';
    const drenched=(q:StormPoint,rad:number)=>this.wet(q,rad)||(danger&&!!floodplainAt(q));
    // Waders only turn back once the flood front reaches them, so a lured horde is caught in it.
    if(danger&&drenched(p,r)&&this.floodAt(p)>.5){this.crossings.delete(owner);return this.refuge(p,r);}
    if(danger&&drenched(goal,r))goal=this.refuge(goal,r);
    const target=stormRegion(goal);
    if(danger&&target!==here){
      // The river is a wall until it drops: shadow the target from the near bank.
      this.crossings.delete(owner);
      const c=STORM_CHANNELS.find(k=>k.sides.includes(here)&&k.sides.includes(target))??nearestChannel(p);
      return this.bank(c,goal.z,c.sides[0]===here?-1:1,r);
    }
    let route=this.crossings.get(owner);
    if(route&&route.target!==target){this.crossings.delete(owner);route=undefined;}
    if(route){
      const s=STORM_SHOALS[route.shoal],c=channelOf(s.channel),z=s.z+route.lane;
      const point=this.bank(c,z,route.stage===0?route.side:-route.side,-1);
      if(Math.hypot(p.x-point.x,p.z-point.z)<1.4){
        if(route.stage===0){route.stage=1;return this.bank(c,z,-route.side,-1);}
        this.crossings.delete(owner);return goal;
      }
      return point;
    }
    const dist=Math.hypot(goal.x-p.x,goal.z-p.z),n=Math.max(2,Math.ceil(dist/2));
    let wet=0;for(let i=0;i<=n;i++)if(this.inRiver({x:p.x+(goal.x-p.x)*i/n,z:p.z+(goal.z-p.z)*i/n},r))wet++;
    if(here===target){
      // Same region, but a straight line may still clip a bend: detour along the bank in danger.
      if(danger&&wet){const m={x:(p.x+goal.x)/2,z:(p.z+goal.z)/2},c=nearestChannel(m);return this.bank(c,m.z,m.x<c.center(m.z)?-1:1,r);}
      return goal;
    }
    let best=Infinity,chosen=-1,lane=0,side=0;
    STORM_SHOALS.forEach((s,index)=>{
      const c=channelOf(s.channel);if(!c.sides.includes(here))return;
      const from=c.sides[0]===here?-1:1,next=c.sides[from<0?1:0];
      // Spread traffic over the shoal's width so opposing streams don't meet head-on.
      const l=from*(.4+((seed%7)/7)*(s.half-r-.8));
      const entry=this.bank(c,s.z+l,from,-1),exit=this.bank(c,s.z+l,-from,-1);
      const occupancy=neighbors.filter(t=>t!==owner&&t.alive&&Math.abs(t.position.z-s.z)<s.half+4&&Math.abs(t.position.x-c.center(s.z))<c.half(s.z)+6).length;
      const score=Math.hypot(p.x-entry.x,p.z-entry.z)+Math.hypot(exit.x-entry.x,exit.z-entry.z)/this.travelScale(entry,exit)
        +Math.hypot(goal.x-exit.x,goal.z-exit.z)+(next===target?0:30)+occupancy*5/(2*s.half);
      if(score<best){best=score;chosen=index;lane=l;side=from;}
    });
    // A direct wade through the deep channel is only worth it when much shorter.
    const direct=dist/this.travelScale(p,goal);
    if(chosen<0||direct<best*.8)return goal;
    route={shoal:chosen,lane,side,stage:0,target};this.crossings.set(owner,route);
    const s=STORM_SHOALS[chosen];return this.bank(channelOf(s.channel),s.z+lane,side,-1);
  }
}
