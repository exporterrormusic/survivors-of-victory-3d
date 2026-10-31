import { ArcRotateCamera, Color4, DefaultRenderingPipeline, Engine, HemisphericLight, ImportMeshAsync, Mesh, PBRMaterial, Scene, ShaderMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(.003,.005,.008,1);
const camera = new ArcRotateCamera('camera', -Math.PI/2, Math.PI/2.15, 16, Vector3.Zero(), scene);
camera.attachControl(canvas, true); camera.minZ=.01; camera.wheelPrecision=35;
const pipeline=new DefaultRenderingPipeline('preview-bloom',true,scene,[camera]);
pipeline.bloomEnabled=true;pipeline.bloomThreshold=.9;pipeline.bloomWeight=.35;pipeline.bloomKernel=48;
new HemisphericLight('light',new Vector3(0,1,-1),scene);
const vertexSource = `precision highp float;
attribute vec3 position,normal; attribute vec2 uv;
uniform mat4 world,worldViewProjection; uniform float time,strength,kind,extent,part;
varying vec2 vUV; varying vec3 vNormal,vWorld,vLocal;
void main(){
 vec3 p=position;
 if(kind>1.5){
  float phase=time*1.45+part*.48+position.y/max(extent,.001)*1.8;
  float breath=sin(phase)*strength;
  p.xz*=1.0+.018*breath;
  p.y+=extent*.006*breath;
  p+=normal*(extent*.0025*breath);
 }
 vUV=uv;vLocal=position/max(extent,.001);vNormal=normalize(mat3(world)*normal);vWorld=(world*vec4(p,1.)).xyz;
 gl_Position=worldViewProjection*vec4(p,1.);
}`;
const fragmentSource = `precision highp float;
varying vec2 vUV;varying vec3 vNormal,vWorld,vLocal;
uniform sampler2D baseTexture;uniform float time,strength,kind;uniform vec3 eye;
void main(){
 vec4 tex=texture2D(baseTexture,vUV);if(tex.a<.08)discard;
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 view=normalize(eye-vWorld);
 float light=.72+.28*max(dot(n,normalize(vec3(-.4,.8,-.6))),0.);
 vec3 color=tex.rgb*light;
 if(kind<.5){
  float green=smoothstep(.025,.19,tex.g-max(tex.r,tex.b))*smoothstep(.12,.4,tex.g);
  float pulse=.5+.5*sin(time*1.8-vLocal.y*3.);
  color+=green*strength*(.22+1.15*pulse)*vec3(.12,1.,.28);
 }else if(kind<1.5){
  float dark=1.-smoothstep(.13,.42,max(tex.r,max(tex.g,tex.b)));
  vec3 p=vLocal*17.;float t=time*.55;
  float a=sin(p.y*1.5+t*2.+sin(p.x*1.7+t)+sin(p.z*1.2-t));
  float b=cos(p.x*1.3+p.z*1.8-t+sin(p.y+t));
  vec3 oilN=normalize(n+strength*.22*vec3(a,b,sin(p.z+p.y-t)));
  vec3 h=normalize(view+normalize(vec3(-.6,.9,-.7)));
  float spec=pow(max(dot(oilN,h),0.),42.);
  float rim=pow(1.-abs(dot(oilN,view)),3.);
  vec3 oil=tex.rgb*.55+vec3(.015,.025,.031)+spec*vec3(.75,.85,.9)+rim*vec3(.07,.11,.13);
  color=mix(color,oil,clamp(dark*strength,0.,1.));
 }
 color=color/(vec3(1.)+max(color-vec3(1.),vec3(0.))*.35);
 gl_FragColor=vec4(color,tex.a);
}`;
const definitions = [
 {id:'xbg006_anmi',description:'A slow green pulse through the bleeding areas. The body stays still.'},
 {id:'xbg003_hsta',description:'Slow-moving oily ripples and wet highlights across the black surfaces.'},
 {id:'xba002_dmtr',description:'A gentle breathing idle with staggered motion across the body, thorns, and outer parts.'},
];
const roots:TransformNode[]=[];
const materials:ShaderMaterial[]=[];
const originals=new Map<Mesh,PBRMaterial>();
const effects=new Map<Mesh,ShaderMaterial>();
let selected=0,time=0,paused=false;
const strength=document.querySelector<HTMLInputElement>('#strength')!;
const speed=document.querySelector<HTMLInputElement>('#speed')!;
const original=document.querySelector<HTMLInputElement>('#original')!;
function reset(){camera.alpha=-Math.PI/2;camera.beta=Math.PI/2.15;camera.radius=16;camera.target.set(0,0,0);}
function select(){roots.forEach((r,i)=>r.setEnabled(i===selected));document.querySelector('#description')!.textContent=definitions[selected].description;reset();}
async function load(){
 for(const [kind,definition] of definitions.entries()){
  const result=await ImportMeshAsync(`/raw/bosses/nkas/${definition.id}.glb`,scene);
  const root=new TransformNode(definition.id,scene);roots.push(root);
  for(const mesh of result.meshes)if(!mesh.parent)mesh.parent=root;
  const bounds=root.getHierarchyBoundingVectors(true);const size=bounds.max.subtract(bounds.min);const extent=Math.max(size.x,size.y,size.z);const scale=8/extent;
  root.scaling.setAll(scale);root.position.copyFrom(bounds.min.add(bounds.max).scale(-.5*scale));
  for(const mesh of result.meshes){
   if(!(mesh instanceof Mesh)||!(mesh.material instanceof PBRMaterial))continue;
   const source=mesh.material;if(!source.albedoTexture)continue;
   const material=new ShaderMaterial(`${definition.id}-${mesh.name}`,scene,{vertexSource,fragmentSource},{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','time','strength','kind','extent','part','eye'],samplers:['baseTexture'],needAlphaBlending:true});
   material.backFaceCulling=false;material.setTexture('baseTexture',source.albedoTexture);material.setFloat('kind',kind);material.setFloat('extent',extent);material.setFloat('part',/thorn/.test(source.name)?1:/parts/.test(source.name)?2:0);
   originals.set(mesh,source);effects.set(mesh,material);mesh.material=material;materials.push(material);
  }
  root.setEnabled(kind===selected);
 }
 select();document.querySelector('#status')!.textContent='Three models ready';
}
document.querySelector<HTMLSelectElement>('#enemy')!.onchange=e=>{selected=Number((e.target as HTMLSelectElement).value);select();};
original.onchange=()=>{for(const [mesh,material]of effects)mesh.material=original.checked?originals.get(mesh)!:material;};
document.querySelector<HTMLButtonElement>('#pause')!.onclick=e=>{paused=!paused;(e.target as HTMLButtonElement).textContent=paused?'Resume':'Pause';};
document.querySelector<HTMLButtonElement>('#reset')!.onclick=reset;
engine.runRenderLoop(()=>{if(!paused)time+=Math.min(engine.getDeltaTime()/1000,.05)*Number(speed.value);for(const m of materials){m.setFloat('time',time);m.setFloat('strength',Number(strength.value));m.setVector3('eye',camera.position);}scene.render();});
window.addEventListener('resize',()=>engine.resize());
Object.assign(window,{enemyPreview:{scene,engine,roots,materials,get time(){return time;}}});
load().catch(error=>{document.querySelector('#status')!.textContent=`Loading failed: ${error.message}`;console.error(error);});
