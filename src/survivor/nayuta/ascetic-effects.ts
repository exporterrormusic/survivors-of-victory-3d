import { Axis, Constants, Effect, Mesh, MeshBuilder, ShaderMaterial, Texture, Vector3 } from '@babylonjs/core';
import { HolyEnergy } from './holy-energy';
import type { FxQuad } from '../vfx';
import type { KitContext } from '../kit';

// Illustrated anime palm sprites with a soft alpha envelope; compiled and pooled during loading.
Effect.ShadersStore.nayutaAsceticVertexShader = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection; uniform float spin; uniform float handSide; uniform float artAspect; uniform float perspectiveWidth; varying vec2 vUV;
void main(){
 vUV=vec2(handSide<0.?1.-uv.x:uv.x,uv.y);
 float c=cos(spin),s=sin(spin);
 vec2 p=vec2(position.x*artAspect*perspectiveWidth,position.y);
 vec2 turned=vec2(c*p.x-s*p.y,s*p.x+c*p.y);
 gl_Position=worldViewProjection*vec4(turned,position.z,1.);
}`;
Effect.ShadersStore.nayutaAsceticFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D fistTex;
uniform float phase;
uniform float strength;
void main(){
 vec4 art=texture2D(fistTex,vUV);
 float fade=smoothstep(0.,.12,phase)*(1.-smoothstep(.55,1.,phase));
 gl_FragColor=vec4(art.rgb,art.a*fade*strength);
}`;

interface Glyph { mesh: Mesh; material: ShaderMaterial; age: number; duration: number; mode: number; from: Vector3; to: Vector3; size: number; delay: number; side: number; arrival?: () => void; trail?: FxQuad }
export class AsceticEffects {
 private pool: Glyph[] = [];
 private texture?: Texture;
 private holy: HolyEnergy;
 constructor(private ctx: KitContext) {this.holy=new HolyEnergy(ctx);}
 async prepare() {
  this.texture=await new Promise<Texture>((resolve,reject)=>{
   const texture=new Texture(`${import.meta.env.BASE_URL}ui/survivor/nayuta/holy-open-palm.png`,this.ctx.scene,false,true,Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(texture),(_message,error)=>reject(error));
   texture.hasAlpha=true;texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  });
  for(let i=0;i<72;i++){
   const mesh=MeshBuilder.CreatePlane('nayuta-ascetic-glyph',{size:1},this.ctx.scene);
   const material=new ShaderMaterial('nayuta-ascetic-gold',this.ctx.scene,'nayutaAscetic',{
    attributes:['position','uv'],uniforms:['worldViewProjection','phase','strength','spin','handSide','artAspect','perspectiveWidth'],samplers:['fistTex'],needAlphaBlending:true,
   });
   material.setTexture('fistTex',this.texture);
   material.alphaMode=Constants.ALPHA_COMBINE; material.disableDepthWrite=true; material.backFaceCulling=false;
   material.setFloat('artAspect',this.texture.getSize().width/this.texture.getSize().height);material.setFloat('perspectiveWidth',1);material.setFloat('spin',0);material.setFloat('handSide',1);material.setFloat('phase',.5);material.setFloat('strength',1);
   mesh.material=material;mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);
   this.pool.push({mesh,material,age:0,duration:0,mode:0,from:new Vector3(),to:new Vector3(),size:1,delay:0,side:1});
  }
  await Promise.all(this.pool.map(g=>g.material.forceCompilationAsync(g.mesh)));
 }
 private spawn(mode:number,from:Vector3,to:Vector3,duration:number,size:number,delay=0,arrival?:()=>void,side=1){
  const g=this.pool.find(g=>g.duration===0);if(!g){arrival?.();return;}
  Object.assign(g,{mode,age:0,duration,size,delay,arrival,side});g.from.copyFrom(from);g.to.copyFrom(to);
  if(mode<2){g.trail=this.ctx.vfx.quad('streak',[1,.65,.12],.6);g.trail.glow=true;}
  g.mesh.position.copyFrom(from);
  g.material.setFloat('strength',1);g.material.setFloat('handSide',side);
  return g;
 }
 departure(at:Vector3){this.holy.departure(at);}
 return(from:Vector3,arrival:()=>void){this.holy.return(from,arrival);}
 palm(from:Vector3,to:Vector3,finisher:boolean,echo=false,side=1){
  // Travel the entire cover-clipped damage corridor with one open palm per strike.
  const glyph=this.spawn(0,from,to,echo?.45:finisher?1:.65,finisher?8.5:5,0,undefined,side);
  glyph?.material.setFloat('strength',echo?.38:1);
 }
 finishIn(seconds:number){this.holy.finishIn(seconds);}
 endHalo(){this.holy.end();for(const g of this.pool)if(g.mode===2){g.duration=0;g.mesh.setEnabled(false);}}
 halo(seconds:number){this.holy.start(seconds);}
 update(dt:number){
  this.holy.update(dt);
  for(const g of this.pool){
   if(!g.duration)continue;
   g.age+=dt;if(g.age<g.delay)continue;
   const t=Math.min(1,(g.age-g.delay)/g.duration);
   g.mesh.setEnabled(true);g.material.setFloat('phase',g.mode===2?.5:t);
   const previous=g.mesh.position.clone();
   if(g.mode===1){
    g.to.copyFrom(this.ctx.playerPosition).y+=.85;
    Vector3.LerpToRef(g.from,g.to,t*t*t,g.mesh.position);
    g.mesh.position.y+=Math.sin(t*Math.PI)*.7;
    g.mesh.scaling.setAll(g.size*(1-t*.6));
   }else if(g.mode===2){
    g.mesh.position.copyFrom(this.ctx.playerPosition);g.mesh.position.y+=1.15;g.mesh.scaling.setAll(g.size);
   }else{
    Vector3.LerpToRef(g.from,g.to,1-Math.pow(1-t,3),g.mesh.position);g.mesh.scaling.setAll(g.size*(.8+t*.2));
    // Billboard height is projected onto world Y; keep its entire quad above terrain.
    const up=this.ctx.vfx.camera.getDirection(Axis.Y),right=this.ctx.vfx.camera.getDirection(Axis.X);
    const direction=g.to.subtract(g.from);direction.y=0;direction.normalize();
    const across=Vector3.Dot(direction,right),depth=Vector3.Dot(direction,up);
    // A palm stays upright in perspective; it must not roll like an arrow.
    // Near camera-forward, retain the selected hand to avoid unstable left/right flips.
    const facing=Math.abs(across)>.12?Math.sign(across):g.side;
    const width=.55+.45*Math.abs(across);
    const spin=-facing*depth*.18;
    g.material.setFloat('handSide',facing);
    g.material.setFloat('perspectiveWidth',width);
    g.material.setFloat('spin',spin);
    // Rotating a square changes its vertical extent; include both rotated axes.
    const c=Math.cos(spin),s=Math.sin(spin);
    const aspect=this.texture!.getSize().width/this.texture!.getSize().height;
    const height=g.size*.5*(aspect*width*Math.abs(right.y*c+up.y*s)+Math.abs(-right.y*s+up.y*c));
    g.mesh.position.y=Math.max(g.mesh.position.y,this.ctx.playerPosition.y+height+.15);
   }
   if(g.trail){this.ctx.vfx.streak(g.trail,g.mode===0?g.from:previous,g.mesh.position,g.mode===0?.13:.07);g.trail.alpha=Math.sin(t*Math.PI)*.6;}
   if(t>=1){if(g.trail){this.ctx.vfx.release(g.trail);g.trail=undefined;}g.duration=0;g.mesh.setEnabled(false);const done=g.arrival;g.arrival=undefined;done?.();}
  }
 }
 clear(){this.holy.clear();for(const g of this.pool){g.duration=0;g.arrival=undefined;if(g.trail){this.ctx.vfx.release(g.trail);g.trail=undefined;}g.mesh.setEnabled(false);}}
 dispose(){this.clear();for(const g of this.pool){g.mesh.dispose();g.material.dispose();}this.pool=[];this.texture?.dispose();}
}
