/** Frozen North's lakes: ice that cracks under weight, collapses in chains, and refreezes (renderer independent). */
export interface LakePoint { x:number; z:number }

/** Grid cell size is 1 m; the grid spans -HALF..HALF on both axes. */
export const LAKE_HALF=56;
export const LAKE_GRID=LAKE_HALF*2;
/** Stress per second under a weight-1 body at the centre of its footprint. */
export const LAKE_CRACK_RATE=1.1;
/** Metres around a body that its weight cracks, fading to nothing at the edge. */
export const LAKE_FOOTPRINT=2.5;
/** Stress lost per second everywhere: untouched ice slowly heals. */
export const LAKE_HEAL=.0015;
/** When ice fails, every connected cell at or above this stress collapses with it. */
export const LAKE_CHAIN=.27;
/** Widespread hairline cracks overload a local area even without standing still. */
export const LAKE_MINOR_CRACK=.08;
export const LAKE_ESCALATION_RADIUS=10;
export const LAKE_ESCALATION_COVERAGE=.2;
/** Stress left in refrozen ice: weak enough to join the next collapse. */
/** Metres the collapse tears into sound ice beyond the cracked area. */
export const LAKE_TEAR=4;
export const LAKE_REFROZEN=.4;
/** Seconds a hole stays open; it skins over during the last REFREEZE_FADE seconds. */
export const LAKE_HOLE_SECONDS=22;
export const LAKE_REFREEZE_FADE=4;
/** Seconds each cell takes to give way: chunks tip, the rim shatters, water floods in. */
export const LAKE_BREAK_IN=.6;
/** Metres per second a collapse spreads outward from where it started. */
export const LAKE_BREAK_SPREAD=25;
/** Radius that always shatters around the failing cell, chain or not. */
/** Seconds fully-cracked ice holds, pulsing, before it collapses. */
export const LAKE_WARNING=1.5;
export const LAKE_HOLE_RADIUS=5;
/** Fraction of max HP lost per tick at full depth; matches the storm river. */
export const LAKE_DAMAGE=.14;
export const LAKE_DAMAGE_INTERVAL=.9;
/** Ground enemies' speed on ice: they pick their way across. */
export const LAKE_ENEMY_ICE_SPEED=.8;
/** Seconds a ground enemy waits at the shore before following onto the ice (plus up to 1.5 s). */
export const LAKE_HESITATION=1.5;
/** Speed multiplier at full depth. */
export const LAKE_WADE_SPEED=.48;

/** Two lakes, each a union of overlapping blobs. The north-west lake reaches up and right across
 * the top of the map; the south-east one mirrors it down and left. The other diagonal stays snow. */
export const LAKES=[
  {x:-26,z:21,r:27,seed:.4},{x:-12,z:34,r:20,seed:5.2},{x:4,z:41,r:17,seed:1.3},
  {x:26,z:-21,r:27,seed:2.1},{x:12,z:-34,r:20,seed:4.6},{x:-4,z:-41,r:17,seed:3.4},{x:-21,z:-42,r:14,seed:0.9},
] as const;
/** Metres over which the shore snow thins out onto the ice. */
export const LAKE_FROST=3.5;
/** Where the shader's frost has faded to half: the line players see between snow and ice. */
export const LAKE_VISIBLE=LAKE_FROST+1.2;
/** Signed metres inside the nearest lake's irregular outline (negative on land). */
export function lakeEdge(x:number,z:number):number{
  let best=-Infinity;
  for(const l of LAKES){
    const dx=x-l.x,dz=z-l.z,a=Math.atan2(dz,dx);
    best=Math.max(best,l.r+1.6*Math.sin(3*a+l.seed)+.9*Math.sin(5*a+l.seed*2.3)-Math.hypot(dx,dz));
  }
  return best;
}
/** Shared by the snow fill and the ice shader so the shore has one uneven line. */
export function lakeShoreNoise(x:number,z:number):number{return Math.sin(x*.9+Math.sin(z*.6)*1.7)*Math.cos(z*.8-x*.3)*.9;}
/** Signed metres inside the visible ice (negative on snow or the frosted shore band).
 * Everything gameplay-facing uses this, so what looks like snow behaves like snow. */
export function lakeSurface(x:number,z:number):number{return lakeEdge(x,z)+lakeShoreNoise(x,z)-LAKE_VISIBLE;}
/** 1 on load-bearing ice, 0 on land, over a metre at the shore. */
export function lakeIce(x:number,z:number):number{return Math.max(0,Math.min(1,lakeSurface(x,z)+.5));}
/** 1 on land, thinning to 0 across the frosted band of ice. */
export function lakeSnowCover(x:number,z:number):number{
  const t=Math.max(0,Math.min(1,(lakeEdge(x,z)+lakeShoreNoise(x,z))/LAKE_FROST));
  return 1-t*t*(3-2*t);
}

interface Body { position:LakePoint; radius:number; hover?:boolean }

export class FrozenLake {
  enabled=false;
  /** 0..1 crack stress per cell. */
  readonly stress=new Float32Array(LAKE_GRID*LAKE_GRID);
  /** Seconds until each open hole refreezes; 0 is solid ice. */
  readonly hole=new Float32Array(LAKE_GRID*LAKE_GRID);
  /** Set whenever stress or holes change; the view clears it after uploading. */
  dirty=true;
  breaks=0;
  /** Nearest land cell for every cell (itself on land), built once: enemy shore goals are a lookup. */
  private shore:Int32Array|null=null;
  private iceMask:Uint8Array|null=null;
  /** A spot that reached full stress and is about to give way. */
  pending:{x:number;z:number;time:number}|null=null;
  private escalation:{cells:number[];starts:number[];origin:number;elapsed:number}|null=null;
  reset(enabled:boolean):void{this.enabled=enabled;this.stress.fill(0);this.hole.fill(0);this.dirty=true;this.breaks=0;this.pending=null;this.escalation=null;this.lastBreak=null;}
  private shoreMap():Int32Array{
    if(this.shore)return this.shore;
    const map=new Int32Array(LAKE_GRID*LAKE_GRID).fill(-1),queue:number[]=[];
    // Land means comfortably off the ice: a metre beyond the outline.
    for(let i=0;i<map.length;i++){const ix=i%LAKE_GRID,iz=(i-ix)/LAKE_GRID;if(lakeSurface(ix-LAKE_HALF+.5,iz-LAKE_HALF+.5)<-1.2){map[i]=i;queue.push(i);}}
    for(let head=0;head<queue.length;head++){
      const i=queue[head],ix=i%LAKE_GRID,iz=(i-ix)/LAKE_GRID;
      for(const [nx,nz] of [[ix+1,iz],[ix-1,iz],[ix,iz+1],[ix,iz-1]]){
        if(nx<0||nz<0||nx>=LAKE_GRID||nz>=LAKE_GRID)continue;const j=nz*LAKE_GRID+nx;
        if(map[j]<0){map[j]=map[i];queue.push(j);}
      }
    }
    return this.shore=map;
  }
  /** Where a hesitating ground enemy waits: the nearest point of shore to a goal on the ice. */
  shoreGoal(goal:LakePoint):LakePoint{
    if(!this.enabled||lakeSurface(goal.x,goal.z)<-1.2)return goal;
    const i=this.cell(goal.x,goal.z);if(i<0)return goal;
    const j=this.shoreMap()[i],jx=j%LAKE_GRID,jz=(j-jx)/LAKE_GRID;
    return {x:jx-LAKE_HALF+.5,z:jz-LAKE_HALF+.5};
  }
  /** Enemies never walk into open water: drop the part of a step that heads deeper into a hole. */
  avoidHoles(from:LakePoint,to:{x:number;z:number}):void{
    if(!this.enabled)return;
    const before=this.depth(from),after=this.depth(to);
    if(after<=.02||after<=before)return;
    const e=.35,gx=this.depth({x:to.x+e,z:to.z})-this.depth({x:to.x-e,z:to.z}),gz=this.depth({x:to.x,z:to.z+e})-this.depth({x:to.x,z:to.z-e}),n=Math.hypot(gx,gz);
    const dx=to.x-from.x,dz=to.z-from.z;
    if(n<1e-6){to.x=from.x;to.z=from.z;return;}
    const into=Math.max(0,(dx*gx+dz*gz)/n);
    to.x=from.x+dx-gx/n*into;to.z=from.z+dz-gz/n*into;
    if(this.depth(to)>Math.max(before,.02)){to.x=from.x;to.z=from.z;}
  }
  /** Nearest dry footing for a body caught in a hole, searched outward on 16 bearings. */
  escape(p:LakePoint):LakePoint|null{
    if(this.depth(p)<=.02)return null;
    for(let r=1;r<=14;r+=.75)for(let k=0;k<16;k++){
      const a=k*Math.PI/8,q={x:p.x+Math.cos(a)*r,z:p.z+Math.sin(a)*r};
      if(this.depth(q)<=0)return q;
    }
    return null;
  }
  /** True while a body stands on visible ice. */
  onIce(p:LakePoint,radius=0):boolean{return this.enabled&&lakeSurface(p.x,p.z)>-radius;}

  private cell(x:number,z:number):number{
    const ix=Math.floor(x+LAKE_HALF),iz=Math.floor(z+LAKE_HALF);
    return ix<0||iz<0||ix>=LAKE_GRID||iz>=LAKE_GRID?-1:iz*LAKE_GRID+ix;
  }
  /** 0 solid, 1 fully open water; fades as the hole skins over. */
  openness(i:number):number{
    const h=this.hole[i];if(h<=0||h>LAKE_HOLE_SECONDS)return 0;
    // Waiting for the spreading break (h above the hole time), giving way, then open, then skinning over.
    return Math.min(1,(LAKE_HOLE_SECONDS-h)/LAKE_BREAK_IN,h/LAKE_REFREEZE_FADE);
  }
  /** Where and when the last collapse began, for splash effects. */
  lastBreak:{x:number;z:number;count:number}|null=null;
  /** Water depth under a point, 0..1, bilinear so shores of a hole are shallow. */
  depth(p:LakePoint):number{
    if(!this.enabled)return 0;
    const fx=p.x+LAKE_HALF-.5,fz=p.z+LAKE_HALF-.5,ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
    const at=(x:number,z:number)=>x<0||z<0||x>=LAKE_GRID||z>=LAKE_GRID?0:this.openness(z*LAKE_GRID+x);
    const v=(at(ix,iz)*(1-tx)+at(ix+1,iz)*tx)*(1-tz)+(at(ix,iz+1)*(1-tx)+at(ix+1,iz+1)*tx)*tz;
    // Matches the drawn water edge (openness .5): no hurt zone around the visible hole.
    const t=Math.max(0,Math.min(1,(v-.45)/.3));return t*t*(3-2*t);
  }
  speed(p:LakePoint,hover=false):number{return hover?1:1-(1-LAKE_WADE_SPEED)*this.depth(p);}
  /** Sample a whole step so dashes cannot skip a hole. */
  travelScale(a:LakePoint,b:LakePoint):number{
    if(!this.enabled)return 1;
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.35));let cost=0;
    for(let i=0;i<=n;i++)cost+=1/this.speed({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n});
    return (n+1)/cost;
  }
  /** The player cracks the ice around them, moving or not. Fights in one area compound. */
  load(body:Body,weight:number,dt:number):void{
    if(!this.enabled||body.hover||dt<=0)return;
    const p=body.position;if(lakeSurface(p.x,p.z)<0)return;
    const r=LAKE_FOOTPRINT,step=weight*dt*LAKE_CRACK_RATE;let failed=false;
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      const cx=Math.floor(p.x)+dx+.5,cz=Math.floor(p.z)+dz+.5,d=Math.hypot(cx-p.x,cz-p.z);
      if(d>=r)continue;
      const i=this.cell(cx,cz);if(i<0||this.hole[i]>0||lakeSurface(cx,cz)<0)continue;
      this.stress[i]+=step*(1-d/r);
      if(this.stress[i]>=1){this.stress[i]=1;failed=true;}
    }
    this.dirty=true;
    if(failed&&!this.pending)this.pending={x:p.x,z:p.z,time:LAKE_WARNING};
    if(!this.pending)this.escalate(p);
  }
  /** Count actual ice area, excluding shore snow; open water cannot trigger another failure. */
  private escalate(p:LakePoint):void{
    if(!this.iceMask){
      this.iceMask=new Uint8Array(this.stress.length);
      for(let i=0;i<this.iceMask.length;i++)this.iceMask[i]=lakeSurface(i%LAKE_GRID-LAKE_HALF+.5,Math.floor(i/LAKE_GRID)-LAKE_HALF+.5)>0?1:0;
    }
    const cracked:number[]=[];let total=0,nearest=-1,distance=Infinity;
    const r=LAKE_ESCALATION_RADIUS;
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      const x=Math.floor(p.x)+dx+.5,z=Math.floor(p.z)+dz+.5,d=Math.hypot(x-p.x,z-p.z);
      if(d>r)continue;
      const i=this.cell(x,z);if(i<0||!this.iceMask[i])continue;
      total++;
      if(this.hole[i]>0||this.stress[i]<LAKE_MINOR_CRACK)continue;
      cracked.push(i);
      if(d<distance){nearest=i;distance=d;}
    }
    if(nearest<0||cracked.length<total*LAKE_ESCALATION_COVERAGE)return;
    // Grow the trail into major fractures over the warning instead of snapping its stress.
    this.escalation={cells:cracked,starts:cracked.map(i=>this.stress[i]),origin:nearest,elapsed:0};
    this.pending={x:nearest%LAKE_GRID-LAKE_HALF+.5,z:Math.floor(nearest/LAKE_GRID)-LAKE_HALF+.5,time:LAKE_WARNING};
    this.dirty=true;
  }
  /** Break the ice here, then every connected patch that is already badly cracked. */
  shatter(x:number,z:number):void{
    this.breaks++;
    const queue:number[]=[];
    this.lastBreak={x,z,count:this.breaks};
    const delay=(i:number)=>{const ix=i%LAKE_GRID,iz=(i-ix)/LAKE_GRID;return Math.hypot(ix-LAKE_HALF+.5-x,iz-LAKE_HALF+.5-z)/LAKE_BREAK_SPREAD;};
    const open=(i:number)=>{this.hole[i]=LAKE_HOLE_SECONDS+delay(i);this.stress[i]=1;queue.push(i);};
    for(let dz=-6;dz<=6;dz++)for(let dx=-6;dx<=6;dx++){
      const cx=Math.floor(x)+dx+.5,cz=Math.floor(z)+dz+.5,i=this.cell(cx,cz);
      if(i>=0&&this.hole[i]<=0&&Math.hypot(cx-x,cz-z)<=LAKE_HOLE_RADIUS&&lakeSurface(cx,cz)>0)open(i);
    }
    const opened:number[]=[];
    while(queue.length){
      const i=queue.pop()!,ix=i%LAKE_GRID,iz=(i-ix)/LAKE_GRID;opened.push(i);
      for(const [nx,nz] of [[ix+1,iz],[ix-1,iz],[ix,iz+1],[ix,iz-1]]){
        if(nx<0||nz<0||nx>=LAKE_GRID||nz>=LAKE_GRID)continue;
        const j=nz*LAKE_GRID+nx;
        if(this.hole[j]<=0&&this.stress[j]>=LAKE_CHAIN&&lakeSurface(nx-LAKE_HALF+.5,nz-LAKE_HALF+.5)>0)open(j);
      }
    }
    // The collapse tears a ragged margin into the sound ice around it.
    for(let ring=0;ring<LAKE_TEAR;ring++){
      const edge:number[]=[];
      for(const i of opened){const ix=i%LAKE_GRID,iz=(i-ix)/LAKE_GRID;
        // Alternating 4- and 8-neighbour rings grow a rounded margin; hashed gaps make it ragged.
        for(const [nx,nz] of ring%2?[[ix+1,iz],[ix-1,iz],[ix,iz+1],[ix,iz-1],[ix+1,iz+1],[ix-1,iz-1],[ix+1,iz-1],[ix-1,iz+1]]:[[ix+1,iz],[ix-1,iz],[ix,iz+1],[ix,iz-1]]){
          if(nx<0||nz<0||nx>=LAKE_GRID||nz>=LAKE_GRID)continue;const j=nz*LAKE_GRID+nx;
          const gap=((Math.sin(nx*12.9898+nz*78.233)*43758.5453)%1+1)%1<.18+ring*.05;
          if(this.hole[j]<=0&&lakeSurface(nx-LAKE_HALF+.5,nz-LAKE_HALF+.5)>0&&!gap){this.hole[j]=LAKE_HOLE_SECONDS+delay(j);this.stress[j]=1;edge.push(j);}
        }}
      opened.splice(0,opened.length,...edge);
    }
    this.dirty=true;
  }
  update(dt:number):void{
    if(!this.enabled||dt<=0)return;
    if(this.escalation){
      const e=this.escalation;
      e.elapsed+=dt;
      const t=Math.min(1,e.elapsed/LAKE_WARNING),blend=t*t*(3-2*t);
      for(let n=0;n<e.cells.length;n++){
        const i=e.cells[n];if(this.hole[i]>0)continue;
        const start=e.starts[n],target=Math.max(start,i===e.origin?1:.75);
        this.stress[i]=Math.max(this.stress[i],start+(target-start)*blend);
      }
      this.dirty=true;
      if(t===1)this.escalation=null;
    }
    if(this.pending&&(this.pending.time-=dt)<=0){const p=this.pending;this.pending=null;this.shatter(p.x,p.z);}
    let changed=false;
    for(let i=0;i<this.hole.length;i++){
      if(this.hole[i]>0){
        this.hole[i]=Math.max(0,this.hole[i]-dt);changed=true;
        // Refrozen ice keeps its scars, but holds again.
        if(this.hole[i]===0)this.stress[i]=LAKE_REFROZEN;
      }else if(this.stress[i]>0){this.stress[i]=Math.max(0,this.stress[i]-LAKE_HEAL*dt);changed=true;}
    }
    if(changed)this.dirty=true;
  }
}
