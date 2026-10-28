import { Color3, Color4, Constants, DynamicTexture, Mesh, NoiseProceduralTexture, ParticleSystem, PointLight, ShaderMaterial, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { OUTSKIRTS_CRATER as C, CRATER_CORE_RADIUS, outskirtsGroundHeight } from './outskirts-landmarks';

type Vent={x:number,z:number,r:number,weight:number};
/** the floor the flames cover evenly: the core and the first stretch of the burning slope */
const FIRE_RADIUS=CRATER_CORE_RADIUS+7;

/** Burning crater floor: glowing fissure shader plus particle flame vents. */
export class CraterFire {
  private floor:Mesh;
  private floorMaterial:ShaderMaterial;
  private flameTexture:DynamicTexture;
  private noise:NoiseProceduralTexture;
  private systems:ParticleSystem[]=[];
  readonly vents:Vent[]=[];
  private time=0;
  /** Fire light thrown on the bowl and anything standing near it. */
  private readonly light:PointLight;
  constructor(scene:Scene){
    let seed=61;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    // Big vents crowd the core; small ones scatter across the burning slope.
    this.vents.push({x:C.x,z:C.z,r:4.5,weight:5});
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7+random()*.5,r=5+random()*(CRATER_CORE_RADIUS-5);
      this.vents.push({x:C.x+Math.cos(a)*r,z:C.z+Math.sin(a)*r,r:2+random()*1.5,weight:2.5});}
    for(let i=0;i<24;i++){const a=i*2.399+random(),r=CRATER_CORE_RADIUS+1+random()*14;
      this.vents.push({x:C.x+Math.cos(a)*r,z:C.z+Math.sin(a)*r,r:1+random()*1.2,weight:1.1});}

    // Fissure overlay hugs the bowl and fades out before the rim.
    const outer=C.radius*.86,segments=72,rings=24,positions:number[]=[],indices:number[]=[],uvs:number[]=[];
    for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,r=ring/rings*outer,x=C.x+Math.cos(a)*r,z=C.z+Math.sin(a)*r;
      positions.push(x,outskirtsGroundHeight(x,z)+.05,z);uvs.push(x-C.x,z-C.z);
      if(ring<rings&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
    }
    const floor=this.floor=new Mesh('crater-fissure-floor',scene);
    const data=new VertexData();data.positions=positions;data.indices=indices;data.uvs=uvs;data.applyToMesh(floor);
    const ventUniform:number[]=[];for(const v of this.vents.slice(0,8))ventUniform.push(v.x-C.x,v.z-C.z,v.r*1.6,0);
    this.floorMaterial=new ShaderMaterial('crater-fissure-mat',scene,{
      vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vP;
        void main(){vP=uv;gl_Position=worldViewProjection*vec4(position,1.);}`,
      fragmentSource:`precision highp float;varying vec2 vP;uniform float time,outer,core;uniform vec4 vents[8];
        vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
        float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(h2(i).x,h2(i+vec2(1,0)).x,f.x),mix(h2(i+vec2(0,1)).x,h2(i+vec2(1,1)).x,f.x),f.y);}
        float cracks(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),o=h2(i+g);vec2 r=g+o-f;float d=dot(r,r);
            if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
          return sqrt(d2)-sqrt(d1);}
        void main(){
          // Fully molten across the core, cooling steadily toward the rim; vents add hot spots.
          float r=length(vP),heat=1.-smoothstep(core*1.1,outer*.92,r)*.85;
          for(int i=0;i<8;i++)heat=max(heat,1.-smoothstep(0.,vents[i].z*1.4,length(vP-vents[i].xy)));
          vec2 w=vP+vec2(n2(vP*.35),n2(vP*.35+7.))*2.2;
          float c=cracks(w*.32),fine=cracks(w*.9+3.);
          float line=(1.-smoothstep(.01,.03+.07*heat*heat,c))+.5*(1.-smoothstep(.01,.03,fine))*heat*heat;
          float flow=.65+.35*sin(time*1.7+n2(vP*.5+time*.15)*6.2832);
          float glow=clamp(line*smoothstep(.08,.9,heat)*flow,0.,1.);
          vec3 lava=mix(vec3(.85,.12,.01),vec3(1.,.72,.22),glow*glow);
          // Every cell between the veins glows, churning slowly, so the bowl reads as fire all over.
          float churn=.55+.45*n2(vP*.6+vec2(time*.25,-time*.18))*n2(vP*1.7-time*.4+4.);
          vec3 ember=mix(vec3(.32,.04,0.),vec3(.8,.24,.02),churn*churn)*heat*heat*(.75+.25*sin(time*2.3+n2(vP*.3)*6.28));
          float scorch=1.-smoothstep(outer*.6,outer,r);
          float speck=step(.93,h2(floor(vP*3.)).x)*(.5+.5*sin(time*(2.+5.*h2(floor(vP*3.)+9.).x)+h2(floor(vP*3.)).y*6.28))*scorch*(1.-smoothstep(.12,.35,length(fract(vP*3.)-.5)));
          glow=max(glow,speck*.85);
          vec3 col=mix(vec3(.05,.03,.02)+ember*.8,lava*1.7,glow);
          float a=(1.-smoothstep(outer*.72,outer,r))*.92;
          gl_FragColor=vec4(col,max(a,glow));}`,
    },{attributes:['position','uv'],uniforms:['worldViewProjection','time','outer','core','vents'],needAlphaBlending:true});
    this.floorMaterial.setFloat('outer',outer);this.floorMaterial.setFloat('core',CRATER_CORE_RADIUS);
    this.floorMaterial.setArray4('vents',ventUniform);this.floorMaterial.setFloat('time',0);
    this.floorMaterial.backFaceCulling=false;this.floorMaterial.disableDepthWrite=true;this.floorMaterial.alphaMode=Constants.ALPHA_COMBINE;
    floor.material=this.floorMaterial;floor.isPickable=false;floor.alphaIndex=1;
    floor.metadata={craterFlame:true,cameraOcclusionDisabled:true};floor.freezeWorldMatrix();

    // Teardrop flame tongue: hot narrow base, ragged tip.
    const ft=this.flameTexture=new DynamicTexture('crater-flame-tongue',{width:64,height:128},scene,true);
    const fc=ft.getContext() as CanvasRenderingContext2D;fc.clearRect(0,0,64,128);
    const g=fc.createRadialGradient(32,92,2,32,80,58);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.75)');g.addColorStop(.7,'rgba(255,255,255,.2)');g.addColorStop(1,'rgba(255,255,255,0)');
    fc.filter='blur(5px)';fc.fillStyle=g;fc.beginPath();fc.moveTo(32,2);fc.bezierCurveTo(46,40,62,74,54,104);fc.quadraticCurveTo(32,132,10,104);fc.bezierCurveTo(2,74,18,40,32,2);fc.fill();
    ft.hasAlpha=true;ft.update();
    this.noise=new NoiseProceduralTexture('crater-flame-noise',128,scene);this.noise.animationSpeedFactor=4;this.noise.brightness=.5;this.noise.octaves=3;

    const pick=()=>{let t=random()*this.vents.reduce((s,v)=>s+v.weight,0);for(const v of this.vents){t-=v.weight;if(t<=0)return v;}return this.vents[0];};
    const system=(name:string,capacity:number,sizeFor:(v:Vent)=>number)=>{
      const p=new ParticleSystem(name,capacity,scene);p.emitter=Vector3.Zero();p.updateSpeed=.012;
      p.startPositionFunction=(_w,pos,particle)=>{
        // Even cover: anywhere on the burning floor, with a share still drawn to the vents.
        if(Math.random()<.7){
          const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*FIRE_RADIUS,x=C.x+Math.cos(a)*d,z=C.z+Math.sin(a)*d;
          pos.set(x,outskirtsGroundHeight(x,z)+.1,z);if(particle)particle.size*=1.6*(1-.4*d/FIRE_RADIUS);
          return;
        }
        const v=pick(),a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*v.r,x=v.x+Math.cos(a)*d,z=v.z+Math.sin(a)*d;
        pos.set(x,outskirtsGroundHeight(x,z)+.1,z);if(particle)particle.size*=sizeFor(v)*(1-.45*d/v.r);
      };
      this.systems.push(p);return p;
    };
    const flames=system('crater-flames',2800,v=>.8+v.r*.34);
    // Fully camera-facing: from the top-down view, Y-axis billboards were seen almost edge-on.
    flames.particleTexture=ft;flames.blendMode=ParticleSystem.BLENDMODE_ADD;flames.billboardMode=ParticleSystem.BILLBOARDMODE_ALL;
    flames.minSize=.8;flames.maxSize=1.45;flames.minScaleY=1.2;flames.maxScaleY=1.8;flames.minLifeTime=.7;flames.maxLifeTime=1.3;flames.emitRate=950;
    flames.direction1=new Vector3(-.25,2.6,-.25);flames.direction2=new Vector3(.25,4,.25);flames.minEmitPower=.9;flames.maxEmitPower=1.4;
    flames.minAngularSpeed=-.4;flames.maxAngularSpeed=.4;flames.noiseTexture=this.noise;flames.noiseStrength=new Vector3(2.2,.6,2.2);
    flames.addSizeGradient(0,.55);flames.addSizeGradient(.3,1);flames.addSizeGradient(1,.15);
    flames.addColorGradient(0,new Color4(1,.95,.75,0));flames.addColorGradient(.08,new Color4(1,.88,.55,.6));
    flames.addColorGradient(.35,new Color4(1,.5,.1,.42));flames.addColorGradient(.75,new Color4(.8,.16,.02,.16));flames.addColorGradient(1,new Color4(.3,.02,0,0));
    flames.preWarmCycles=60;flames.start();

    const smoke=system('crater-vent-smoke',500,v=>.6+v.r*.25);
    smoke.particleTexture=ft;smoke.blendMode=ParticleSystem.BLENDMODE_STANDARD;
    smoke.minSize=3;smoke.maxSize=5.5;smoke.minLifeTime=4;smoke.maxLifeTime=7;smoke.emitRate=55;
    smoke.direction1=new Vector3(.3,2.4,-.4);smoke.direction2=new Vector3(1.4,3.4,.4);smoke.minEmitPower=.8;smoke.maxEmitPower=1.2;
    smoke.addSizeGradient(0,.5);smoke.addSizeGradient(1,3.2);smoke.minAngularSpeed=-.25;smoke.maxAngularSpeed=.25;
    smoke.addColorGradient(0,new Color4(.25,.12,.06,0));smoke.addColorGradient(.12,new Color4(.16,.12,.1,.45));smoke.addColorGradient(1,new Color4(.28,.26,.24,0));
    smoke.noiseTexture=this.noise;smoke.noiseStrength=new Vector3(1,.2,1);smoke.preWarmCycles=200;smoke.preWarmStepOffset=3;smoke.start();

    const light=this.light=new PointLight('crater-fire-light',new Vector3(C.x,outskirtsGroundHeight(C.x,C.z)+4,C.z),scene);
    light.diffuse=new Color3(1,.45,.15);light.specular=new Color3(.4,.18,.06);light.range=C.radius*1.3;light.intensity=1.6;
  }
  /** Picks a spawn point on a random vent, weighted toward the core. */
  ventPoint(spread=1):Vector3{
    const total=this.vents.reduce((s,v)=>s+v.weight,0);let t=Math.random()*total,v=this.vents[0];
    for(const vent of this.vents){t-=vent.weight;if(t<=0){v=vent;break;}}
    const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*v.r*spread,x=v.x+Math.cos(a)*d,z=v.z+Math.sin(a)*d;
    return new Vector3(x,outskirtsGroundHeight(x,z)+.2,z);
  }
  /** Random point anywhere on the scorched bowl, for ground-level cinders. */
  bowlPoint():Vector3{
    const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*C.radius*.82,x=C.x+Math.cos(a)*d,z=C.z+Math.sin(a)*d;
    return new Vector3(x,outskirtsGroundHeight(x,z)+.08,z);
  }
  update(dt:number){
    this.time+=dt;this.floorMaterial.setFloat('time',this.time);
    // The fire light and glow flicker with the flames.
    const flicker=.85+.1*Math.sin(this.time*7.3)+.05*Math.sin(this.time*17.1);
    this.light.intensity=1.6*flicker;
    for(const system of this.systems)system.updateSpeed=dt>0?.012:0;
    this.noise.animationSpeedFactor=dt>0?4:0;
  }
  dispose(){for(const s of this.systems)s.dispose(false);this.floor.dispose();this.floorMaterial.dispose();this.flameTexture.dispose();this.noise.dispose();this.light.dispose();}
}
