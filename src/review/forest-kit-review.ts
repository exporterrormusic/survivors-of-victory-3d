import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3, type TransformNode } from '@babylonjs/core';
import { FOREST_ASSETS, createForestAsset, ForestMaterials, type ForestAsset } from '../survivor/forest-kit';
const canvas=document.querySelector<HTMLCanvasElement>('#view')!,engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.12,.16,.19,1);
const camera=new ArcRotateCamera('forest-review',-1.1,1.05,7,new Vector3(0,1.4,0),scene);camera.attachControl(canvas,true);camera.minZ=.05;
const fill=new HemisphericLight('fill',Vector3.Up(),scene);fill.intensity=.8;
const sun=new DirectionalLight('sun',new Vector3(-.5,-1,.4),scene);sun.position.set(10,25,-10);sun.intensity=1.4;
const shadows=new ShadowGenerator(2048,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=.001;
const ground=MeshBuilder.CreateGround('floor',{width:150,height:150},scene),mat=new StandardMaterial('floor',scene);
mat.diffuseColor=new Color3(.21,.24,.22);mat.specularColor.set(0,0,0);ground.material=mat;ground.receiveShadows=true;
const materials=new ForestMaterials(scene);let roots:TransformNode[]=[];
function show(asset:ForestAsset|'all'){
  for(const root of roots){for(const m of root.getChildMeshes())shadows.removeShadowCaster(m);root.dispose();}roots=[];
  for(const [i,id] of (asset==='all'?FOREST_ASSETS:[asset]).entries()){
    const root=createForestAsset(scene,id,materials);if(asset==='all')root.position.set((i%4-1.5)*11,0,Math.floor(i/4)*13-13);
    roots.push(root);for(const m of root.getChildMeshes())shadows.addShadowCaster(m);
  }
  camera.setTarget(new Vector3(0,asset==='all'?1:asset==='forest-chapel'?3:1.4,0));
  camera.radius=asset==='all'?53:asset==='forest-chapel'?20:asset==='forest-cabin'||asset==='forest-lychgate'?13:7;
  if(asset==='forest-jack-o-lantern'){camera.setTarget(new Vector3(0,.5,0));camera.radius=2.7;camera.alpha=-Math.PI/2-.22;camera.beta=1.15;}
  if(asset==='forest-vapaus-vial'){camera.setTarget(new Vector3(0,.07,0));camera.radius=.30;camera.alpha=-Math.PI/2-.28;camera.beta=1.18;camera.minZ=.001;}
}
for(const id of ['all',...FOREST_ASSETS] as const){const b=document.createElement('button');b.textContent=id==='forest-vapaus-vial'?'Vapaus vial':id.replace('forest-','');b.onclick=()=>show(id);document.querySelector('#assets')!.append(b);}
show('forest-well');engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
Object.assign(window,{forestKit:{scene,camera,show,assets:FOREST_ASSETS}});
