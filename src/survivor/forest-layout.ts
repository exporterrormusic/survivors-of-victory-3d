import type { RangePlacement } from './range-environments.ts';

export const FOREST_RADIUS=62;

/**
 * Haunted Pine Forest. Five places, each with its own silhouette:
 *   centre — the lift clearing, a cobbled ring lit by two ghost-lamps;
 *   north  — the ruined chapel and its fenced churchyard, reached through a lychgate;
 *   west   — the stone circle: eight rune menhirs round an altar, ringed by dead pines;
 *   east   — the woodcutter's camp: log cabin, woodpiles, well;
 *   south  — the old forest gate where the road comes in.
 * Cobblestone paths wind between them; sparse lamps, well apart, mark the way.
 */
type P=readonly [number,number];
export interface ForestPath {half:number;controls:readonly P[]}
export const FOREST_PATHS:readonly ForestPath[]=[
  // South gate -> lift -> chapel: the spine.
  {half:2.6,controls:[[0,-60],[-2,-50],[-7,-38],[4,-25],[-1,-12],[0,0],[-6,12],[5,24],[0,34],[0,40]]},
  // Stone circle -> lift -> camp.
  {half:2.4,controls:[[-36,4],[-28,-2],[-17,4],[-7,-1],[0,0],[9,-4],[21,2],[32,-5],[37,-3]]},
  // Loops between neighbouring places, narrower.
  {half:1.9,controls:[[5,24],[16,32],[30,26],[38,14],[41,6]]},
  {half:1.9,controls:[[-37,-3],[-38,-18],[-26,-32],[-12,-40],[-5,-42]]},
];
/** Cobbled courts (paved) and trampled yards (earth). Shared with the shader and the fog pass. */
export const FOREST_COURTS=[
  {x:0,z:0,r:9,paved:true},
  {x:0,z:43,r:7.5,paved:true},
  {x:0,z:-50,r:5,paved:true},
  {x:-44,z:4,r:10,paved:false},
  {x:45,z:-2,r:10,paved:false},
] as const;

function catmull(a:P,b:P,c:P,d:P,t:number):[number,number]{
  const t2=t*t,t3=t2*t;
  const f=(p0:number,p1:number,p2:number,p3:number)=>.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
  return [f(a[0],b[0],c[0],d[0]),f(a[1],b[1],c[1],d[1])];
}
/** Each path sampled into short straight segments (~2.5 m). */
export const FOREST_PATH_POINTS:readonly (readonly P[])[]=FOREST_PATHS.map(({controls:c})=>{
  const out:P[]=[];
  for(let i=0;i<c.length-1;i++){
    const a=c[Math.max(0,i-1)],b=c[i],e=c[i+1],d=c[Math.min(c.length-1,i+2)];
    const n=Math.max(2,Math.ceil(Math.hypot(e[0]-b[0],e[1]-b[1])/2.5));
    for(let k=0;k<n;k++)out.push(catmull(a,b,e,d,k/n));
  }
  out.push(c[c.length-1]);return out;
});

function segDistance(x:number,z:number,[ax,az]:P,[bx,bz]:P):number{
  const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-ax-dx*t,z-az-dz*t);
}
/** Distance outside the nearest path or court (negative = on it). */
export function forestOpenDistance(x:number,z:number):number{
  let best=Infinity;
  for(const [i,pts] of FOREST_PATH_POINTS.entries())for(let k=0;k<pts.length-1;k++)best=Math.min(best,segDistance(x,z,pts[k],pts[k+1])-FOREST_PATHS[i].half);
  for(const c of FOREST_COURTS)best=Math.min(best,Math.hypot(x-c.x,z-c.z)-c.r);
  return best;
}
/** Point and direction a given distance along a path, for lamps that keep a steady rhythm. */
function along(path:number,distance:number):{x:number;z:number;nx:number;nz:number}|null{
  const pts=FOREST_PATH_POINTS[path];
  for(let k=0;k<pts.length-1;k++){
    const [ax,az]=pts[k],[bx,bz]=pts[k+1],len=Math.hypot(bx-ax,bz-az);
    if(distance<=len){const t=distance/len;return {x:ax+(bx-ax)*t,z:az+(bz-az)*t,nx:-(bz-az)/len,nz:(bx-ax)/len};}
    distance-=len;
  }
  return null;
}

/** Built-up places the groves must leave alone. */
const LANDMARKS=[{x:0,z:53,r:9},{x:-16,z:48,r:10},{x:16,z:48,r:10},{x:-44,z:4,r:12},{x:50,z:2,r:9},{x:-2,z:-46,r:11}];
export function forestPlacements():RangePlacement[]{
  const list:RangePlacement[]=[];
  const put=(asset:RangePlacement['asset'],x:number,z:number,scale=1,yaw=0)=>list.push({asset,x,z,scale,yaw});
  // Front (-Z) of an asset at (x,z) turned to face the point (tx,tz).
  const facing=(x:number,z:number,tx:number,tz:number)=>Math.atan2(x-tx,z-tz);
  // A lychgate straddling path 0 where it crosses z, square to the path.
  const gate=(near:number,z:number)=>{
    const pts=FOREST_PATH_POINTS[0];
    let k=0;while(k<pts.length-2&&(pts[k+1][1]<z)===(pts[0][1]<z))k++;
    const [ax,az]=pts[k],[bx,bz]=pts[k+1],t=(z-az)/(bz-az||1),x=ax+(bx-ax)*t+near;
    const yaw=Math.atan2(bx-ax,bz-az);
    put('forest-lychgate',x,z,1,yaw);return {x,z,yaw};
  };

  // ── Centre: the lift clearing. Two lamps on the grass just outside the cobbled ring.
  for(const a of [.785,3.927])put('forest-lamp',Math.cos(a)*10.4,Math.sin(a)*10.4,1,Math.PI-a);

  // ── North: ruined chapel, churchyard on both sides, lychgate on the path.
  gate(0,36);
  put('forest-chapel',0,53,1,0);
  put('forest-lamp',-5.5,44,1,0);
  for(const side of [-1,1]){
    // Each plot: a fenced rectangle opening onto the chapel court.
    const cx=side*16,cz=48;
    for(const z of [42,45.4,48.8,52.2])put('forest-fence',cx+side*7,z,1,Math.PI/2);
    for(const x of [-4.8,-1.6,1.6,4.8])put('forest-fence',cx+x,55.2,1,0);
    for(const x of [-4.8,1.6,4.8])put('forest-fence',cx+x,40.4,1,0);
    for(const z of [42,52.2])put('forest-fence',cx-side*7,z,1,Math.PI/2);
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const x=cx-4.5+col*3,z=44+row*3.6,lean=((row*7+col*3)%5-2)*.05;
      put(side<0?'forest-grave':(row+col)%3===0?'forest-grave':'forest-cross',x,z,1,lean);
    }
    put('dead-pine',cx+side*5.5,57.5,1.25,side);
  }

  // ── West: the stone circle, open toward the path.
  const sc={x:-44,z:4};
  for(let i=0;i<9;i++){
    if(i===0)continue;
    const a=i*Math.PI*2/9;
    put('forest-menhir',sc.x+Math.cos(a)*7.5,sc.z+Math.sin(a)*7.5,1+((i*5)%3)*.12,facing(sc.x+Math.cos(a)*7.5,sc.z+Math.sin(a)*7.5,sc.x,sc.z));
  }
  put('forest-altar',sc.x,sc.z,1.15,Math.PI/2);
  for(let i=0;i<6;i++){
    const a=.5+i*Math.PI*2/6,r=14;
    const x=sc.x+Math.cos(a)*r,z=sc.z+Math.sin(a)*r;
    if(Math.abs(Math.cos(a)-1)<.15||forestOpenDistance(x,z)<1.5)continue; // keep the entrance and loop path open
    put('dead-pine',x,z,1.1+(i%3)*.15,a);
  }

  // ── East: the woodcutter's camp.
  put('forest-cabin',52,4,1,Math.PI/2);
  put('forest-woodpile',44,7.5,1,0.15);put('forest-woodpile',47,-10,1,Math.PI-.2);
  put('forest-well',40,-8,1,0);
  put('cover-timber',51,-5,1.1,.3);put('log-fallen',36,11,1.1,1.2);put('log-fallen',54,-9,1.1,.5);
  put('cover-crate',47,10.6,.9,.2);put('cover-crate',48.6,11.8,.8,.9);put('cover-barrel',45.6,11.6,1,0);
  put('forest-lamp',36,.9,1,Math.PI/2); // north of the road, arm reaching back over it

  // ── South: the forest gate, flanked by broken walls.
  const south=gate(0,-46);
  for(const s of [-1,1]){
    const c=Math.cos(south.yaw),n=-Math.sin(south.yaw);
    put('wall-broken',south.x+c*s*6.6,south.z+n*s*6.6,1.2,south.yaw);put('wall-broken',south.x+c*s*9.2,south.z+n*s*9.2-.4,1.1,south.yaw+.15*s);
  }
  put('forest-lamp',3.6,-53,1,Math.PI);

  // Lamps every 26 m along each path, alternating sides, skipping courts and never within 18 m of another lamp.
  const lampClear=(x:number,z:number)=>!list.some(q=>q.asset==='forest-lamp'&&Math.hypot(q.x-x,q.z-z)<18);
  for(const [i,p] of FOREST_PATHS.entries())for(let d=12,k=0;;d+=26,k++){
    const at=along(i,d);if(!at)break;
    let s=k%2?1:-1;
    // The lamp east of the altar stands on the north side of its road.
    if(Math.hypot(at.x+24,at.z+1)<4&&at.nz*s<0)s=-s;
    const x=at.x+at.nx*s*(p.half+1.1),z=at.z+at.nz*s*(p.half+1.1);
    if(FOREST_COURTS.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+4))continue;
    if(forestOpenDistance(x,z)<.3||list.some(q=>Math.hypot(q.x-x,q.z-z)<3)||!lampClear(x,z))continue;
    // The lantern arm (local +X) reaches back over the path.
    put('forest-lamp',x,z,1,Math.atan2(s*at.nz,-s*at.nx));
  }
  // The lamp below the east churchyard hangs its lantern south, toward the camp road.
  for(const q of list)if(q.asset==='forest-lamp'&&Math.hypot(q.x-15.1,q.z-28.6)<1)q.yaw=Math.PI/2;

  // Sparse dead copses between places: one bare snag over a walk-through thorn brake.
  const copses:[number,number][]=[
    [-16,16],[17,13],[-18,-16],[18,-18],[-30,22],[28,40],[-26,40],[34,-26],[-44,-24],[-40,30],
    [14,-40],[-52,-12],[54,22],[24,-50],[-20,-52],[-12,28],[12,-28],[42,-36],[-30,52],[46,30],
  ];
  const free=(x:number,z:number,gap:number)=>forestOpenDistance(x,z)>=2.5&&Math.hypot(x,z)<=FOREST_RADIUS-5
    &&!LANDMARKS.some(l=>Math.hypot(x-l.x,z-l.z)<l.r)&&!list.some(q=>Math.hypot(q.x-x,q.z-z)<gap);
  for(const [i,[x,z]] of copses.entries()){
    const yaw=i*2.399;
    if(i%2===0&&free(x,z,4))put('dead-pine',x,z,1.15+(i%3)*.15,yaw);
    for(const k of [0,1]){
      const tx=x+2.2*Math.cos(yaw+2.4+k*1.6),tz=z+2.2*Math.sin(yaw+2.4+k*1.6);
      if(free(tx,tz,1.8))put('forest-thorn',tx,tz,.9+k*.25,yaw+k);
    }
  }
  // Boundary: a continuous wall of snags and thorn brakes, as on the Frozen North.
  let seed=40417;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Trunks ~1.6 m apart per row and rows staggered, so no gap reads as walkable.
  for(let row=0;row<4;row++){
    const n=row%2===0?230:200;
    for(let i=0;i<n;i++){
      const a=(i+(row%2)*.5+(rnd()-.5)*.35)*Math.PI*2/n;
      const r=FOREST_RADIUS-1+row*2.2+Math.sin(a*5)*.9+(rnd()-.5)*1.1;
      if(row%2===0)put('dead-pine',Math.cos(a)*r,Math.sin(a)*r,1.2+rnd()*.6,rnd()*Math.PI*2);
      else put('forest-thorn',Math.cos(a)*r,Math.sin(a)*r,1.5+rnd()*.6,rnd()*Math.PI*2);
    }
  }
  return list;
}

/** GLSL: `pathD` (outside nearest cobbled path/court) and `yardD` (outside nearest earth yard). Needs vec2 `g`. */
export function forestPathGLSL():string{
  const lines=['float pathD=1e5,yardD=1e5;'];
  for(const [i,pts] of FOREST_PATH_POINTS.entries())for(let k=0;k<pts.length-1;k++){
    const [ax,az]=pts[k],[bx,bz]=pts[k+1];
    lines.push(`{vec2 a=vec2(${ax.toFixed(2)},${az.toFixed(2)}),ab=vec2(${(bx-ax).toFixed(2)},${(bz-az).toFixed(2)});pathD=min(pathD,length(g-a-ab*clamp(dot(g-a,ab)/dot(ab,ab),0.,1.))-${FOREST_PATHS[i].half.toFixed(1)});}`);
  }
  for(const c of FOREST_COURTS)lines.push(`${c.paved?'pathD':'yardD'}=min(${c.paved?'pathD':'yardD'},length(g-vec2(${c.x.toFixed(1)},${c.z.toFixed(1)}))-${c.r.toFixed(1)});`);
  return lines.join('\n');
}
