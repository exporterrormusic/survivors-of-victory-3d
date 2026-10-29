import { Vector3 } from '@babylonjs/core';
import type { Vfx } from '../vfx';

/** Crisp expanding energy crown with white, barbed feathers drifting after the impact. */
export function dorothyLanding(vfx: Vfx, position: Vector3, radius: number) {
  const at=position.clone();
  const energy=vfx.quad('ring',[1,.08,.48],.9);energy.motif='energy';energy.glow=true;
  const feathers=Array.from({length:22},(_,i)=>{
    const q=vfx.quad('ring',[1,1,1],1,'alpha');q.motif='feather';
    const angle=i*2.399963, speed=1.7+(i%5)*.5;
    return {q,angle,speed,lift:1.8+(i%4)*.55,size:.65+(i%3)*.18};
  });
  const point=new Vector3();
  vfx.flash(at.add(new Vector3(0,.5,0)),[1,.12,.5],1.2,6,.15);
  vfx.add({
    update(_dt,age){
      if(age>=1.5)return false;
      energy.visible=age<.5;
      if(age<.5){
        const progress=Math.min(1,age/.28);
        vfx.decal(energy,at,radius*2/.9*(.12+.88*(1-(1-progress)**3)),age*.35);
        energy.alpha=.85*(1-Math.max(0,(age-.15)/.35));
      }
      for(const f of feathers){
        const travel=f.speed*(1-Math.exp(-age*2));
        point.set(at.x+Math.sin(f.angle)*travel+Math.sin(age*5+f.angle)*age*.15,
          at.y+.18+Math.max(0,f.lift*age-1.35*age*age),at.z+Math.cos(f.angle)*travel);
        vfx.sprite(f.q,point,f.size,f.angle+Math.sin(age*4+f.angle)*.6+age*.35);
        f.q.alpha=Math.min(1,(1.5-age)/.45);
      }
      return true;
    },
    dispose(){vfx.release(energy);for(const f of feathers)vfx.release(f.q);},
  });
}
