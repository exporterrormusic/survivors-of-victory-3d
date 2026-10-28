import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3, type TransformNode } from '@babylonjs/core';
import { GLTF2Export } from '@babylonjs/serializers/glTF';
import { STORM_ASSETS, type StormAsset } from '../survivor/storm-layout';
import { createStormAsset, StormMaterials } from '../survivor/storm-kit';
const canvas=document.querySelector<HTMLCanvasElement>('#view')!,engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.21,.25,.28,1);
const camera=new ArcRotateCamera('storm-kit-review',-1.15,1.1,25,new Vector3(0,2,0),scene);camera.attachControl(canvas,true);camera.minZ=.1;camera.maxZ=300;
const fill=new HemisphericLight('fill',Vector3.Up(),scene);fill.intensity=.85;
const sun=new DirectionalLight('sun',new Vector3(-.5,-1,.45),scene);sun.position.set(10,25,-10);sun.intensity=1.1;
const shadows=new ShadowGenerator(2048,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=.001;
const floor=MeshBuilder.CreateGround('floor',{width:120,height:120},scene),mat=new StandardMaterial('floor',scene);mat.diffuseColor=new Color3(.32,.35,.30);mat.specularColor.set(0,0,0);floor.material=mat;floor.receiveShadows=true;
const materials=new StormMaterials(scene);let roots:TransformNode[]=[];
function show(asset:StormAsset|'all'){
  for(const root of roots){for(const m of root.getChildMeshes())shadows.removeShadowCaster(m);root.dispose();}roots=[];
  const list=asset==='all'?STORM_ASSETS:[asset];
  for(const [i,id] of list.entries()){
    const root=createStormAsset(scene,id,materials);
    if(asset==='all')root.position.set((i%3-1)*40,0,Math.floor(i/3)*18-18);
    roots.push(root);for(const m of root.getChildMeshes())shadows.addShadowCaster(m);
  }
  camera.setTarget(new Vector3(0,2,0));camera.radius=asset==='all'?100:30;
}
for(const id of ['all',...STORM_ASSETS] as const){const b=document.createElement('button');b.textContent=id;b.onclick=()=>show(id);document.querySelector('#assets')!.append(b);}
show('all');engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
async function exportAsset(asset:StormAsset){
  const exportScene=new Scene(engine);const root=createStormAsset(exportScene,asset,new StormMaterials(exportScene));
  try{
    const deadline=performance.now()+30000;
    while(exportScene.textures.some(t=>!t.isReady())){if(performance.now()>deadline)throw Error('Storm texture loading timed out');await new Promise(r=>setTimeout(r,50));}
    const glb=await GLTF2Export.GLBAsync(exportScene,asset,{exportWithoutWaitingForScene:true});
    const data=new Uint8Array(await (glb.glTFFiles[`${asset}.glb`] as Blob).arrayBuffer());
    let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
    return {base64:btoa(binary),triangles:root.getChildMeshes().reduce((n,m)=>n+m.getTotalIndices()/3,0)};
  }finally{exportScene.dispose();}
}
Object.assign(window,{stormKit:{scene,camera,show,exportAsset,assets:STORM_ASSETS}});

