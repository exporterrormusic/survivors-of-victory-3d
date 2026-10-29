import { Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { FxQuad } from '../vfx';

const GOLD=[1,.72,.19] as const, IVORY=[1,.97,.72] as const;
const ease=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
interface Stream { from:Vector3; age:number; duration:number; quads:FxQuad[]; arrived:boolean; arrival:()=>void }
/** Batched holy ribbons. Return streams render after mist, like readable world-space status FX. */
export class HolyEnergy {
 private streams:Stream[]=[];
 private aura:FxQuad[]=[];
 private age=0;
 private remaining=0;
 constructor(private ctx:KitContext){}
 private quad(texture:'streak'|'holy-shard'|'holy-seal'|'holy-halo'|'glow',top=false,ivory=false){
  const q=this.ctx.vfx.quad(texture,ivory?IVORY:GOLD);q.glow=true;q.onTop=top;return q;
 }
 return(from:Vector3,arrival:()=>void,silver=false){
  this.streams.push({from:from.add(new Vector3(0,.8,0)),age:0,duration:.9+Math.min(.35,Vector3.Distance(from,this.ctx.playerPosition)*.03),arrived:false,arrival,
   quads:Array.from({length:104},(_,i)=>{const q=this.quad(i<48?'streak':'holy-shard',true,i%3===0);if(silver)this.ctx.vfx.tint(q,[.83,.93,1],1);return q;})});
 }
 flash(at:Vector3,duration=1.2,size=6,silver=false){
  const center=at.add(new Vector3(0,1.2,0)),shell=this.quad('glow',true),core=this.quad('glow',true,true),ring=this.quad('holy-halo',true,true);
  if(silver)for(const q of [shell,core,ring])this.ctx.vfx.tint(q,[.83,.93,1],1);
  this.ctx.vfx.add({update:(_dt,age)=>{
   if(age>=duration)return false;
   const t=age/duration,alpha=Math.pow(Math.sin(t*Math.PI),2);
   this.ctx.vfx.sprite(shell,center,size*(.8+t*.3));shell.alpha=alpha;
   this.ctx.vfx.sprite(core,center,size*.65);core.alpha=alpha*1.2;
   this.ctx.vfx.sprite(ring,center,size*(.3+t*.7),t*.2);ring.alpha=alpha*.8;
   return true;
  },dispose:()=>{for(const q of [shell,core,ring])this.ctx.vfx.release(q);}});
 }
 departure(at:Vector3,silver=false){
  this.flash(at,.35,2.7,silver);
  const start=at.add(new Vector3(0,.9,0));
  const shards=Array.from({length:22},(_,i)=>({q:this.quad('holy-shard',true,i%3===0),a:i*2.399}));
  if(silver)for(const s of shards)this.ctx.vfx.tint(s.q,[.83,.93,1],1);
  this.ctx.vfx.add({update:(_dt,age)=>{
   if(age>=.6)return false;
   for(const [i,s] of shards.entries()){
    this.ctx.vfx.sprite(s.q,start.add(new Vector3(Math.sin(s.a)*age*(1+i%3),age*1.8,Math.cos(s.a)*age*(1+i%3))),.12+(i%3)*.06,s.a);
    s.q.alpha=Math.sin(age/.6*Math.PI)*.8;
   }return true;
  },dispose:()=>{for(const s of shards)this.ctx.vfx.release(s.q);}});
 }
 start(seconds:number){
  this.end();this.age=0;this.remaining=seconds;
  this.aura=[this.quad('holy-seal'),this.quad('holy-halo'),this.quad('glow'),
   ...Array.from({length:48},()=>this.quad('streak')),
   ...Array.from({length:36},(_,i)=>this.quad('holy-shard',false,i%3===0))];
 }
 finishIn(seconds:number){this.remaining=Math.min(this.remaining,seconds);}
 end(){for(const q of this.aura)this.ctx.vfx.release(q);this.aura=[];this.remaining=0;}
 private path(from:Vector3,t:number,phase=0){
  t=Math.max(0,Math.min(1,t));const to=this.ctx.playerPosition.add(new Vector3(0,1.05,0));
  const p=Vector3.Lerp(from,to,t*t*t),spiral=Math.sin(t*Math.PI)*.33;
  p.x+=Math.sin(t*13+phase)*spiral;p.z+=Math.cos(t*13+phase)*spiral;
  p.y+=Math.sin(t*Math.PI)*.85;return p;
 }
 update(dt:number){
  const vfx=this.ctx.vfx;
  for(let s=this.streams.length-1;s>=0;s--){
   const stream=this.streams[s];stream.age+=dt;const t=stream.age/stream.duration;
   if(t>=1&&!stream.arrived){stream.arrived=true;stream.arrival();}
   if(t>=1.35){for(const q of stream.quads)vfx.release(q);this.streams.splice(s,1);continue;}
   const fade=ease(t*8)*(1-ease((t-1)/.35));
   // Two continuous ribbons: broad gold body and a narrow ivory edge.
   for(let i=0;i<24;i++){
    const p=Math.max(0,t-.32)+i/24*.32,a=this.path(stream.from,p),b=this.path(stream.from,p+.32/24);
    vfx.streak(stream.quads[i*2],a,b,.42);stream.quads[i*2].alpha=fade*.7;
    vfx.streak(stream.quads[i*2+1],a,b,.12);stream.quads[i*2+1].alpha=fade;
   }
   for(let i=0;i<56;i++){
    const u=t-(i/56)*.3,point=this.path(stream.from,u,i*2.399),q=stream.quads[48+i];
    vfx.sprite(q,point,.12+(i%5)*.035,stream.age+i);q.alpha=fade*(.5+.5*Math.sin(Math.max(0,Math.min(1,u))*Math.PI));
   }
  }
  if(!this.aura.length)return;
  this.age+=dt;this.remaining-=dt;
  const fade=ease(this.age/1.2)*ease(this.remaining/.65),at=this.ctx.playerPosition;
  vfx.decal(this.aura[0],at.add(new Vector3(0,.08,0)),4.8,this.age*.16);this.aura[0].alpha=fade*.5;
  vfx.decal(this.aura[1],at.add(new Vector3(0,.1,0)),3.8,-this.age*.22);this.aura[1].alpha=fade*.65;
  vfx.sprite(this.aura[2],at.add(new Vector3(0,1.5,0)),4);this.aura[2].alpha=fade*.16;
  const helix=(t:number,phase:number)=>at.add(new Vector3(Math.cos(t*Math.PI*2+phase+this.age*.75)*(1.2-.35*t),.2+t*2.8,Math.sin(t*Math.PI*2+phase+this.age*.75)*(1.2-.35*t)));
  for(let i=0;i<48;i++){
   const t=(i%24)/24,phase=i<24?0:Math.PI,q=this.aura[3+i];
   vfx.streak(q,helix(t,phase),helix(t+1/24,phase),.1+.07*Math.sin(t*Math.PI));q.alpha=fade*.5*Math.sin(t*Math.PI);
  }
  for(let i=0;i<36;i++){
   const t=(this.age*.22+i*.618)%1,a=i*2.399+this.age*.45,r=.8+(i%4)*.2,q=this.aura[51+i];
   vfx.sprite(q,at.add(new Vector3(Math.cos(a)*r,.2+t*3.2,Math.sin(a)*r)),.1+(i%3)*.05,this.age*.3+i);q.alpha=fade*Math.sin(t*Math.PI)*.8;
  }
  if(this.remaining<=0)this.end();
 }
 clear(){this.end();for(const s of this.streams)for(const q of s.quads)this.ctx.vfx.release(q);this.streams=[];}
}
