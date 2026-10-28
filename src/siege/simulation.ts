import { ARK, LANES, OBJECTIVE_SITES, FALLBACK_X, FINAL_X, SPAWN_X, distance, lanePath, move, pointOnPath, walkable } from './layout.ts';
import type { Point } from './layout.ts';
export interface Defense extends Point { id:string; lane:number; tier:'gate'|'fallback'|'ark'; hp:number; maxHp:number; cooldown:number }
export interface Unit extends Point { id:number; side:'ally'|'enemy'; lane:number; hp:number; maxHp:number; progress:number; cooldown:number; heavy:boolean }
export interface Objective extends Point { id:string; kind:'rescue'|'supply'|'artillery'; state:'available'|'escorting'|'complete'; guards:number; trail:Point[] }
export interface Shot { from:Point; to:Point; side:'ally'|'enemy'|'player'; ttl:number }
export class SiegeSimulation {
  time=0; wave=0; nextWave=3; nextAllies=0; paused=false; ended=false; rescued=0; kills=0;
  player={...ARK,hp:100,respawn:0,cooldown:0,dash:0};
  defenses:Defense[]=LANES.flatMap((z,lane)=>[
    {id:`gate-${lane}`,lane,tier:'gate' as const,x:0,z,hp:450,maxHp:450,cooldown:0},
    {id:`fallback-${lane}`,lane,tier:'fallback' as const,x:FALLBACK_X,z,hp:600,maxHp:600,cooldown:0},
  ]);
  units:Unit[]=[]; shots:Shot[]=[];
  objectives:Objective[]=OBJECTIVE_SITES.map((p,i)=>({...p,id:`site-${i}`,kind:(['rescue','supply','artillery'] as const)[i],state:'available',guards:i===2?4:3,trail:[]}));
  message='Waves approach from the right. Hold the midfield gates.';
  private nextId=1;
  private escortSample=0;
  constructor(){this.defenses.push({id:'ark',lane:-1,tier:'ark',...{x:FINAL_X,z:0},hp:1000,maxHp:1000,cooldown:0});}
  get core(){return this.defenses[this.defenses.length-1];}
  clear=(p:Point):boolean=>!this.defenses.some(d=>d.hp>0&&Math.abs(p.x-d.x)<1.25&&Math.abs(Math.abs(p.z-d.z)-6)<3.65);
  sight(a:Point,b:Point):boolean {const n=Math.ceil(distance(a,b)*2);for(let i=1;i<n;i++)if(!walkable({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},0))return false;return true;}
  front(lane:number):number {return this.defenses.find(d=>d.lane===lane&&d.hp>0)?.x??this.core.x;}
  breach(lane:number):void { const d=this.defenses.find(d=>d.lane===lane&&d.hp>0);if(d)this.damageDefense(d,d.hp); }
  damageDefense(d:Defense,amount:number):void {
    if(d.hp<=0)return;
    d.hp=Math.max(0,d.hp-amount);
    if(d.hp>0)return;
    if(d.tier==='ark'){this.ended=true;this.message='Ark defense lost. Reset to try another route.';return;}
    this.message=`${['Top','Mid','Bottom'][d.lane]} ${d.tier} lost. Survivors stranded in occupied ground.`;
    // On-lane location remains navigable after either tier is lost.
    const site=d.tier==='gate'?{x:-45,z:LANES[d.lane]}:{x:-105,z:LANES[d.lane]*.75};
    this.objectives.push({id:`rescue-${d.id}`,...site,kind:'rescue',state:'available',guards:2,trail:[]});
  }
  spawn(side:'ally'|'enemy',lane:number,count:number):void {
    for(let i=0;i<count;i++) {
      const heavy=side==='enemy'&&this.wave%3===0&&i===0;
      const path=side==='ally'?lanePath(lane):[...lanePath(lane)].reverse();
      const progress=-i*1.8;
      this.units.push({id:this.nextId++,side,lane,...pointOnPath(path,0),hp:heavy?120:side==='ally'?50:55,maxHp:heavy?120:side==='ally'?50:55,progress,cooldown:0,heavy});
    }
  }
  fire(at:Point):void {
    const p=this.player;
    if(this.paused||this.ended||p.respawn>0||p.cooldown>0)return;
    p.cooldown=.22;
    const dx=at.x-p.x,dz=at.z-p.z,length=Math.hypot(dx,dz)||1;
    const end={x:p.x+dx/length*18,z:p.z+dz/length*18};
    // Aim ray hit test: frontmost target within a forgiving 1.1 m capsule.
    const targets=this.units.filter(u=>u.side==='enemy'&&u.hp>0).map(u=>({u,t:((u.x-p.x)*dx+(u.z-p.z)*dz)/length})).filter(({u,t})=>t>0&&t<18&&Math.abs((u.x-p.x)*dz-(u.z-p.z)*dx)/length<1.1).sort((a,b)=>a.t-b.t);
    const hit=targets.find(({u})=>this.sight(p,u))?.u;
    if(hit){hit.hp-=24;end.x=hit.x;end.z=hit.z;}
    else {
      const obj=this.objectives.find(o=>o.state==='available'&&o.guards>0&&distance(o,at)<3&&distance(p,o)<18&&this.sight(p,o));
      if(obj){obj.guards=Math.max(0,obj.guards-.34);end.x=obj.x;end.z=obj.z;}
    }
    this.shots.push({from:{...p},to:end,side:'player',ttl:.1});
  }
  interact():void {
    if(this.paused||this.ended||this.player.respawn>0)return;
    const o=this.objectives.find(o=>o.state==='available'&&distance(o,this.player)<4);
    if(!o){this.message='Approach a gold objective marker. Clear its guards, then press E.';return;}
    if(o.guards>0){this.message='Clear the red objective guards with your rifle first.';return;}
    if(o.kind==='rescue'){o.state='escorting';o.trail=[{...this.player}];this.message='Escort the survivors back to the Ark elevator.';}
    else {o.state='complete';if(o.kind==='supply'){this.player.hp=100;this.message='Supplies recovered. Health restored.';}else this.message='Artillery disabled. Future enemy waves are smaller.';}
  }
  step(dt:number, input={x:0,z:0,sprint:false}):void {
    if(this.paused||this.ended)return;
    dt=Math.min(dt,.05); this.time+=dt;
    const p=this.player;p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);
    if(p.respawn>0){p.respawn-=dt;if(p.respawn<=0){Object.assign(p,ARK,{hp:100,respawn:0});}}
    else {
      const len=Math.hypot(input.x,input.z)||1;
      const sprint=input.sprint&&p.dash<=0;
      if(sprint)p.dash=3;
      const speed=p.dash>2.75?19:9;
      move(p,input.x/len*speed*dt,input.z/len*speed*dt,this.clear);
      if(distance(p,ARK)<7)p.hp=Math.min(100,p.hp+20*dt);
    }
    if(this.time>=this.nextWave){
      this.wave++;this.nextWave+=24;
      const reduced=this.objectives.some(o=>o.kind==='artillery'&&o.state==='complete');
      for(let lane=0;lane<3;lane++)this.spawn('enemy',lane,Math.min(9,3+Math.floor(this.wave/3)+(lane===(this.wave-1)%3?2:0))-(reduced?1:0));
    }
    if(this.time>=this.nextAllies){this.nextAllies+=28;for(let lane=0;lane<3;lane++)this.spawn('ally',lane,2+Math.min(2,this.rescued));}
    const hit=(u:Unit,target:Point&{hp:number},damage:number)=>{
      if(u.cooldown>0)return;u.cooldown=.8;target.hp-=damage;
      this.shots.push({from:{x:u.x,z:u.z},to:{x:target.x,z:target.z},side:u.side,ttl:.12});
    };
    for(const u of this.units){
      if(u.hp<=0)continue;u.cooldown-=dt;
      const opponents=this.units.filter(v=>v.side!==u.side&&v.hp>0&&distance(u,v)<7);
      const other=opponents.sort((a,b)=>distance(u,a)-distance(u,b))[0];
      if(other){hit(u,other,u.heavy?15:8);continue;}
      if(u.side==='enemy'&&p.respawn<=0&&distance(u,p)<8&&this.sight(u,p)){hit(u,p,u.heavy?12:5);continue;}
      const gate=u.side==='enemy'?this.defenses.find(d=>(d.lane===u.lane||d.lane===-1)&&d.hp>0):undefined;
      if(gate&&distance(u,gate)<8){
        if(u.cooldown<=0){u.cooldown=1;this.shots.push({from:{...u},to:{...gate},side:'enemy',ttl:.12});this.damageDefense(gate,u.heavy?24:10);}
        continue;
      }
      const path=u.side==='ally'?lanePath(u.lane):[...lanePath(u.lane)].reverse();
      u.progress+=dt*(u.side==='ally'?4.8:u.heavy?2.4:3.3);Object.assign(u,pointOnPath(path,u.progress));
      if(u.side==='ally'&&u.x>=SPAWN_X-.1)u.hp=0;
    }
    for(const d of this.defenses){
      if(d.hp<=0)continue;d.cooldown-=dt;
      const target=this.units.find(u=>u.side==='enemy'&&u.hp>0&&distance(u,d)<13);
      if(target&&d.cooldown<=0){d.cooldown=.65;target.hp-=15;this.shots.push({from:{...d},to:{...target},side:'ally',ttl:.12});}
    }
    this.escortSample-=dt;
    for(const o of this.objectives){
      if(o.state==='available'&&o.guards>0&&p.respawn<=0&&distance(o,p)<10&&this.sight(o,p))p.hp-=dt*5;
      if(o.state!=='escorting')continue;
      if(p.respawn>0){o.state='available';o.trail=[];this.message='Escort interrupted. Survivors are waiting where you fell.';continue;}
      if(this.escortSample<=0&&(!o.trail.length||distance(o.trail[o.trail.length-1],p)>.6))o.trail.push({x:p.x,z:p.z});
      const next=o.trail[0];
      if(next){const dist=distance(o,next),s=Math.min(dist,7.5*dt);if(dist<.3)o.trail.shift();else move(o,(next.x-o.x)/dist*s,(next.z-o.z)/dist*s,this.clear);}
      if(distance(o,ARK)<6){o.state='complete';this.rescued++;this.message='Squad rescued. Allied reinforcement waves strengthened.';}
    }
    if(this.escortSample<=0)this.escortSample=.1;
    if(p.hp<=0&&p.respawn<=0){p.hp=0;p.respawn=7;this.message='Downed. Redeploying from the elevator in 7 seconds.';}
    this.kills+=this.units.filter(u=>u.hp<=0&&u.side==='enemy').length;
    this.units=this.units.filter(u=>u.hp>0);
    this.shots=this.shots.filter(s=>(s.ttl-=dt)>0);
  }
}
