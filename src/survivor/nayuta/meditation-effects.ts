import { Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';
import type { FxQuad } from '../vfx';

/** Steady halo and slow prayer beads, inspired by Nayuta's halo/sphere motifs. */
export class MeditationEffects {
 private quads:FxQuad[]=[];
 private fade=0;
 private time=0;
 constructor(private ctx:KitContext){}
 update(dt:number,active:boolean){
  this.time+=dt;this.fade+=(Number(active)-this.fade)*Math.min(1,dt*4);
  if(!this.quads.length&&active){
   this.quads=[this.ctx.vfx.quad('holy-halo',[1,.86,.46]),...Array.from({length:12},()=>this.ctx.vfx.quad('glow',[1,.91,.65]))];
   for(const q of this.quads)q.glow=true;
  }
  if(!this.quads.length)return;
  const at=this.ctx.playerPosition;
  this.ctx.vfx.sprite(this.quads[0],at.add(new Vector3(0,1.65,0)),2.2,this.time*.06);
  this.quads[0].alpha=this.fade*.28;
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6+this.time*.28;
   const position=at.add(new Vector3(Math.cos(a)*1.05,1+.22*Math.sin(a),Math.sin(a)*1.05));
   this.ctx.vfx.sprite(this.quads[i+1],position,.12+.02*Math.sin(this.time*.7+i));
   this.quads[i+1].alpha=this.fade*.85;
  }
  if(!active&&this.fade<.005)this.clear();
 }
 clear(){for(const q of this.quads)this.ctx.vfx.release(q);this.quads=[];this.fade=0;}
}
