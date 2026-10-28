import { Color4, DynamicTexture, ParticleSystem, Vector3, type Scene } from '@babylonjs/core';

/** Windborne ash plus low dust shedding from the broken ends of fallen towers. */
export class CityDust {
  private systems:ParticleSystem[]=[];
  private texture:DynamicTexture;
  constructor(scene:Scene){
    this.texture=new DynamicTexture('city-dust-soft',{width:64,height:64},scene,false);
    const ctx=this.texture.getContext(),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,255,255,0.65)');gradient.addColorStop(.45,'rgba(255,255,255,0.27)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);this.texture.hasAlpha=true;this.texture.update();
    const make=(name:string,capacity:number)=>{
      const p=new ParticleSystem(name,capacity,scene);p.particleTexture=this.texture;
      p.blendMode=ParticleSystem.BLENDMODE_STANDARD;p.updateSpeed=.012;
      p.addColorGradient(0,new Color4(.57,.59,.60,0));
      p.addColorGradient(.15,new Color4(.57,.59,.60,.28));
      p.addColorGradient(.6,new Color4(.49,.51,.53,.20));
      p.addColorGradient(1,new Color4(.45,.47,.49,0));
      p.preWarmCycles=90;p.preWarmStepOffset=2;this.systems.push(p);return p;
    };
    const ash=make('city-windborne-ash',450);
    ash.emitter=Vector3.Zero();ash.minEmitBox=new Vector3(-32,.7,-32);ash.maxEmitBox=new Vector3(32,8,32);
    ash.minSize=.045;ash.maxSize=.14;ash.minLifeTime=5;ash.maxLifeTime=9;ash.emitRate=55;
    ash.direction1=new Vector3(1,-.12,.25);ash.direction2=new Vector3(2.2,-.4,.65);
    ash.minEmitPower=.8;ash.maxEmitPower=1.3;ash.gravity=new Vector3(0,-.03,0);ash.start();
    for(const [x,z] of [[-12,18],[12,-18],[27,12],[-27,-12]]){
      const p=make('city-ground-dust-gust',70);
      p.emitter=new Vector3(x,.2,z);p.minEmitBox=new Vector3(-1,0,-1);p.maxEmitBox=new Vector3(1,.5,1);
      p.minSize=1.4;p.maxSize=3.5;p.addSizeGradient(0,.45);p.addSizeGradient(1,1.8);
      p.minLifeTime=4;p.maxLifeTime=7;p.emitRate=9;
      p.direction1=new Vector3(.8,.04,.25);p.direction2=new Vector3(1.6,.14,.5);
      p.minEmitPower=.6;p.maxEmitPower=1;p.minAngularSpeed=-.2;p.maxAngularSpeed=.2;
      p.start();
    }
  }
  setPaused(paused:boolean):void{for(const p of this.systems)p.updateSpeed=paused?0:.012;}
  dispose():void{for(const p of this.systems)p.dispose(false);this.texture.dispose();}
}
