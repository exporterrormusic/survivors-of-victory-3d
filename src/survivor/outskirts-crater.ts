import { Color3, Color4, DynamicTexture, Mesh, ParticleSystem, PointLight, StandardMaterial, Texture, Vector3, VertexData, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { addAnimeEffectLight, removeAnimeEffectLight } from '../toon';
import { applyCraterSparkShader } from './crater-spark-shader';
import { CraterFire } from './crater-fire';
import { OUTSKIRTS_CRATER as CRATER, outskirtsGroundHeight } from './outskirts-landmarks';

/** Vast excavated bowl that consumes the southeast map corner. */
export class OutskirtsCrater {
  private mesh:Mesh;

  private texture:DynamicTexture;
  private emberTexture:DynamicTexture;
  private heat:PointLight;
  private scene:Scene;
  private systems:ParticleSystem[]=[];
  private fire:CraterFire;
  private flicker=0;
  constructor(scene:Scene,shadows:ShadowGenerator){
    this.scene=scene;
    const mesh=this.mesh=new Mesh('outskirts-impact-crater',scene);
    const positions:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[],uvs:number[]=[];
    const segments=96,ringCount=40;
    for(let ring=0;ring<=ringCount;ring++)for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,r=ring/ringCount*CRATER.radius;
      const x=CRATER.x+Math.cos(a)*r,z=CRATER.z+Math.sin(a)*r;
      positions.push(x,outskirtsGroundHeight(x,z)+.015,z);
      uvs.push((x-CRATER.x)/6,(z-CRATER.z)/6);
      const shade=.72+.28*ring/ringCount;
      colors.push(shade,shade,shade,1);
      if(ring<ringCount&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}
    }
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;data.uvs=uvs;data.applyToMesh(mesh);
    // Sharing the exact terrain shader and world UVs removes the circular material seam.
    mesh.material=scene.getMaterialByName('range-ground-mat')!;
    mesh.receiveShadows=true;mesh.isPickable=false;
    mesh.metadata={rangeDressing:true,theme:'outskirts',cameraOcclusionDisabled:true};mesh.freezeWorldMatrix();shadows.addShadowCaster(mesh);
    const texture=this.texture=new DynamicTexture('crater-smoke-soft',64,scene,false);
    const ctx=texture.getContext(),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,255,255,.8)');gradient.addColorStop(.45,'rgba(255,255,255,.35)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);texture.hasAlpha=true;texture.update();
    this.emberTexture=new DynamicTexture('crater-cinder-sprite',32,scene,false);
    const ec=this.emberTexture.getContext();ec.clearRect(0,0,32,32);
    const eg=ec.createRadialGradient(16,16,0,16,16,15);
    eg.addColorStop(0,'rgba(255,255,255,1)');eg.addColorStop(.17,'rgba(255,255,255,.95)');eg.addColorStop(.4,'rgba(255,255,255,.3)');eg.addColorStop(1,'rgba(255,255,255,0)');
    ec.fillStyle=eg;ec.fillRect(0,0,32,32);this.emberTexture.hasAlpha=true;this.emberTexture.update();
    this.heat=new PointLight('crater-cinder-glow',new Vector3(CRATER.x,-CRATER.depth+7,CRATER.z),scene);
    this.heat.diffuse=new Color3(1,.24,.025);this.heat.specular=Color3.Black();
    this.heat.intensity=1.5;this.heat.range=CRATER.radius*.9;addAnimeEffectLight(scene,this.heat);
    this.fire=new CraterFire(scene);
    const make=(name:string,capacity:number,spread=1)=>{
      const p=new ParticleSystem(name,capacity,scene);p.particleTexture=texture;p.blendMode=ParticleSystem.BLENDMODE_STANDARD;
      p.emitter=Vector3.Zero();
      // Particles start on the vents themselves rather than a floating emitter.
      p.startPositionFunction=(_world,position)=>{position.copyFrom(this.fire.ventPoint(spread));};
      p.updateSpeed=.012;p.preWarmCycles=90;p.preWarmStepOffset=2;this.systems.push(p);return p;
    };
    // Thin heat haze over the whole bowl, kept low so it never muddies the fissures.
    const smoke=make('outskirts-crater-smoke',300,2.4);
    smoke.minSize=4;smoke.maxSize=7;smoke.addSizeGradient(0,.6);smoke.addSizeGradient(1,2.2);
    smoke.minLifeTime=6;smoke.maxLifeTime=9;smoke.emitRate=28;
    smoke.direction1=new Vector3(.4,.6,-.3);smoke.direction2=new Vector3(1.2,1.1,.4);smoke.minEmitPower=.6;smoke.maxEmitPower=1;
    smoke.addColorGradient(0,new Color4(.3,.16,.08,0));smoke.addColorGradient(.2,new Color4(.22,.18,.15,.25));smoke.addColorGradient(1,new Color4(.35,.32,.3,0));
    smoke.minAngularSpeed=-.2;smoke.maxAngularSpeed=.2;smoke.start();
    const embers=(name:string,capacity:number,spread:number,rate:number,size:number)=>{
      const ash=make(name,capacity,spread);ash.particleTexture=this.emberTexture;
      ash.blendMode=ParticleSystem.BLENDMODE_ADD;
      ash.billboardMode=ParticleSystem.BILLBOARDMODE_ALL;ash.minScaleY=.7;ash.maxScaleY=1.2;
      ash.minAngularSpeed=-3;ash.maxAngularSpeed=3;
      ash.minSize=size*.5;ash.maxSize=size;ash.minLifeTime=2;ash.maxLifeTime=4.5;ash.emitRate=rate;
      ash.direction1=new Vector3(-.8,3,-.8);ash.direction2=new Vector3(1.2,5.5,.8);ash.minEmitPower=.8;ash.maxEmitPower=1.5;ash.gravity=new Vector3(.4,-.5,-.1);
      ash.addColorGradient(0,new Color4(1.6,1.3,1,1));ash.addColorGradient(.3,new Color4(1.4,.8,.3,1));ash.addColorGradient(.75,new Color4(1,.35,.08,.7));ash.addColorGradient(1,new Color4(.5,.08,0,0));
      applyCraterSparkShader(ash,scene);ash.start();
    };
    embers('outskirts-crater-ash',1400,1.6,220,.24);
    // Smouldering specks resting on the slope plus slow wisps lifting off it, bowl-wide.
    const ground=(name:string,capacity:number,rate:number,lift:number,life:number)=>{
      const g=make(name,capacity);g.startPositionFunction=(_w,pos)=>{pos.copyFrom(this.fire.bowlPoint());};
      g.particleTexture=this.emberTexture;g.blendMode=ParticleSystem.BLENDMODE_ADD;
      g.minSize=.12;g.maxSize=.3;g.minLifeTime=life*.5;g.maxLifeTime=life;g.emitRate=rate;
      g.direction1=new Vector3(-.2,lift*.4,-.2);g.direction2=new Vector3(.3,lift,.2);g.minEmitPower=.6;g.maxEmitPower=1;g.gravity=new Vector3(.2,0,0);
      g.addColorGradient(0,new Color4(1,.4,.08,0));g.addColorGradient(.15,new Color4(1.4,.75,.25,1));g.addColorGradient(.6,new Color4(1,.3,.05,.8));g.addColorGradient(1,new Color4(.4,.05,0,0));
      applyCraterSparkShader(g,scene);g.start();
    };
    ground('outskirts-crater-ground-cinders',1800,260,.05,6);
    ground('outskirts-crater-rising-wisps',900,140,2.2,4);
    embers('outskirts-crater-core-cinders',500,.8,90,.34);
  }
  setPaused(paused:boolean){
    const dt=paused?0:Math.min(.05,this.scene.getEngine().getDeltaTime()/1000);this.fire.update(dt);
    for(const system of this.systems)system.updateSpeed=paused?0:.012;
    if(!paused){this.flicker+=dt;this.heat.intensity=1.5+.35*Math.sin(this.flicker*9.1)*Math.sin(this.flicker*3.7+1);}
  }
  dispose(){this.fire.dispose();removeAnimeEffectLight(this.scene,this.heat);this.heat.dispose();for(const system of this.systems)system.dispose(false);this.texture.dispose();this.mesh.dispose();this.emberTexture.dispose();}
}
