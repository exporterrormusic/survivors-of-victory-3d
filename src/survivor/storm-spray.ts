import { Mesh, ShaderMaterial, VertexData, type Scene, type TransformNode } from '@babylonjs/core';
import { STORM_CHANNELS, STORM_FLOOD_SPREAD, channelFlow, stormLakeEdge, stormFloodGLSL } from './storm-field';
import { STORM_RIVER_BOULDERS, stormPlacements } from './storm-layout';

/** Fixed GPU spray pool: ballistic droplets and soft mist, driven by the same river clock.
 * No per-frame allocations or particle spawning; disposing the map disposes the pool. */
export function createStormSpray(scene:Scene,parent:TransformNode):ShaderMaterial {
 const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
 let seed=0;
 const add=(x:number,z:number,dx:number,dz:number,bank:number)=>{
  const base=positions.length/3,s=seed++;
  for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
   positions.push(x,.12,z);uvs.push(u,v);colors.push(s*.6180339,dx,dz,bank);
  }
  indices.push(base,base+1,base+2,base,base+2,base+3);
 };
 for(const c of STORM_CHANNELS){
  for(let z=Math.max(-62,c.zMin);z<Math.min(80,c.zMax);z+=1.4){
   const dir=channelFlow(c,z);
   for(const side of [-1,1]){
    const x=c.center(z)+side*(c.half(z)-.45);
    if(z<stormLakeEdge(x))continue;
    for(let n=0;n<3;n++)add(x,z+n*.35,dir.x,dir.z,side);
   }
   // Mid-channel spindrift appears only during a flood.
   for(const across of [-.5,0,.5])add(c.center(z)+c.half(z)*across,z,dir.x,dir.z,0);
  }
 }
 for(const b of STORM_RIVER_BOULDERS)for(let i=0;i<22;i++){
  const a=i*2.39996;add(b.x+Math.cos(a)*b.scale,b.z+Math.sin(a)*b.scale,Math.cos(a)*.3,-1,2);
 }
 // Ford stones: the current breaks white on each stone's upstream face.
 // Fine droplets (3) and soft puffs (4) stay strong in calm water: it's a raging river.
 for(const p of stormPlacements())if(p.walkable){
  const r=.55*p.scale;
  for(let i=0;i<60;i++){const a=.2+((i*.618)%1)*(Math.PI-.4);add(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r,Math.cos(a)*.6,-.6,3);}
  for(let i=0;i<7;i++){const a=.4+i/6*(Math.PI-.8);add(p.x+Math.cos(a)*r*.8,p.z+Math.sin(a)*r*.8,Math.cos(a)*.3,-.8,4);}
 }
 const mesh=new Mesh('storm-bank-spray',scene),data=new VertexData();
 Object.assign(data,{positions,colors,uvs,indices});data.applyToMesh(mesh);
 mesh.parent=parent;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;
 const material=new ShaderMaterial('storm-bank-spray-material',scene,{
  vertexSource:`precision highp float;
   attribute vec3 position;attribute vec2 uv;attribute vec4 color;
   uniform mat4 view,viewProjection;uniform float time,surgeAge;
   ${stormFloodGLSL}
   varying vec2 vUV;varying float vAlpha;varying vec3 vWorld;
   void main(){
    float flood=stormFloodAt(position.z,surgeAge);
    float seed=fract(color.x),life=fract(time*(.8+seed*.6)+seed*11.);
    bool bank=abs(color.w)>.5;bool rock=color.w>1.5;bool mist=color.w>2.5,puff=color.w>3.5;
    float force=.22+flood*1.4;
    vec3 p=position;
    if(bank&&!rock)p.x+=color.w*${STORM_FLOOD_SPREAD.toFixed(1)}*flood;
    p.xz+=color.yz*life*(.6+flood*3.)+vec2(sin(seed*37.),cos(seed*51.))*life*force;
    p.y+=4.*life*(1.-life)*force*(.65+seed);
    float size=mix(.035,.16,seed)*(.65+flood*1.5)*(1.+life);
    vec3 right=vec3(view[0][0],view[1][0],view[2][0]);
    vec3 up=vec3(view[0][1],view[1][1],view[2][1]);
    p+=(right*(uv.x-.5)+up*(uv.y-.5)*(1.2+seed))*size;
    vUV=uv;vWorld=p;
    vAlpha=sin(life*3.14159)*(.2+flood*.42)*(bank?1.:flood);
    if(mist){
     // Ford spray: fast, fine and dense; puffs are slow soft clouds hanging over the stone.
     life=fract(time*(puff?.35:1.6+seed*.9)+seed*11.);
     p=position;p.xz+=color.yz*life*(puff?1.2:.9)+vec2(sin(seed*37.),cos(seed*51.))*life*(puff?.5:.45);
     p.y=.3+(puff?.25+.7*life:4.*life*(1.-life)*(.6+seed)*(1.+flood));
     size=puff?mix(.6,1.1,seed)*(.6+life):mix(.04,.09,seed);
     p+=(right*(uv.x-.5)+up*(uv.y-.5))*size;
     vAlpha=sin(life*3.14159)*(puff?.32:1.)*(1.+flood*.5);
    }
    gl_Position=viewProjection*vec4(p,1.);
   }`,
  fragmentSource:`precision highp float;
   varying vec2 vUV;varying float vAlpha;varying vec3 vWorld;
   uniform float daylight,fogDensity;uniform vec3 eye,fogColor;
   void main(){
    float r=length((vUV-.5)*2.);
    float alpha=(1.-smoothstep(.1,1.,r))*vAlpha;
    if(alpha<.015)discard;
    float fog=1.-exp(-pow(length(vWorld-eye)*fogDensity,2.));
    gl_FragColor=vec4(mix(vec3(.8,.92,1.)*(.65+.35*daylight),fogColor,fog),alpha);
   }`,
 },{attributes:['position','uv','color'],uniforms:['view','viewProjection','time','surgeAge','daylight','eye','fogColor','fogDensity'],needAlphaBlending:true});
 material.backFaceCulling=false;material.disableDepthWrite=true;mesh.material=material;
 return material;
}
