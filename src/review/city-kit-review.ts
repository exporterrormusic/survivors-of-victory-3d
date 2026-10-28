import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3, type TransformNode } from '@babylonjs/core';
import { GLTF2Export } from '@babylonjs/serializers/glTF';
import { CITY_ASSETS, cityPlacements, type CityAsset } from '../survivor/city-layout';
import { createCityAsset } from '../survivor/city-kit';
import { CityMaterials } from '../survivor/city-materials';
const canvas=document.querySelector<HTMLCanvasElement>('#view')!,engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.19,.23,.28,1);
const camera=new ArcRotateCamera('city-review',-Math.PI/2,1.06,105,new Vector3(0,14,0),scene);camera.attachControl(canvas,true);camera.maxZ=500;camera.minZ=.1;
const fill=new HemisphericLight('fill',Vector3.Up(),scene);fill.intensity=.8;
const sun=new DirectionalLight('sun',new Vector3(-.5,-1,.5),scene);sun.intensity=1.2;
const floor=MeshBuilder.CreateGround('floor',{width:110,height:110},scene),mat=new StandardMaterial('floor',scene);mat.diffuseColor=new Color3(.24,.25,.25);floor.material=mat;
const painter=new CityMaterials(scene);let roots:TransformNode[]=[];
function show(asset:CityAsset|'layout'|'all'){
  roots.forEach(r=>r.dispose());roots=[];
  const placements=asset==='layout'?cityPlacements():asset==='all'?Object.keys(CITY_ASSETS).map((a,i)=>({asset:a as CityAsset,x:(i-2.5)*12,z:0,yaw:0,scale:1})):[{asset,x:0,z:0,yaw:0,scale:1}];
  for(const p of placements){const root=createCityAsset(scene,p.asset,painter.concrete,painter.steel,painter.glass);root.position.set(p.x,.04,p.z);root.rotation.y=p.yaw;roots.push(root);}
  camera.setTarget(new Vector3(0,asset==='layout'?0:1,0));camera.radius=asset==='all'?95:asset==='layout'?100:40;
}
for(const asset of ['all','layout',...Object.keys(CITY_ASSETS)] as const){const b=document.createElement('button');b.textContent=asset;b.onclick=()=>show(asset as CityAsset|'all'|'layout');document.querySelector('#assets')!.append(b);}
show('all');engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
async function exportAsset(asset:CityAsset){
 const exportScene=new Scene(engine),materials=new CityMaterials(exportScene);
 try{const root=createCityAsset(exportScene,asset,materials.concrete,materials.steel,materials.glass);
 const exportCamera=new ArcRotateCamera('export-camera',0,1,60,Vector3.Zero(),exportScene);
 exportScene.activeCamera=exportCamera;
 const deadline=performance.now()+20000;
 while(exportScene.textures.some(t=>!t.isReady())){
   if(performance.now()>deadline)throw new Error('City export textures did not load');
   await new Promise(resolve=>setTimeout(resolve,50));
 }
 const glb=await GLTF2Export.GLBAsync(exportScene,asset,{exportWithoutWaitingForScene:true,shouldExportNode:n=>n!==exportCamera});
 const data=new Uint8Array(await (glb.glTFFiles[`${asset}.glb`] as Blob).arrayBuffer());
 let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
 return {base64:btoa(binary),triangles:root.getChildMeshes().reduce((n,m)=>n+m.getTotalIndices()/3,0)};
 }finally{exportScene.dispose();}
}
Object.assign(window,{cityKit:{scene,camera,show,exportAsset,assets:Object.keys(CITY_ASSETS)}});
