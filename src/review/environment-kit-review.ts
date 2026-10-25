import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { GLTF2Export } from '@babylonjs/serializers/glTF';
import { KIT_ASSETS, KIT_FINISHES, createEnvironmentProp, type KitAsset, type KitFinish } from '../environment-kit';
const canvas=document.querySelector<HTMLCanvasElement>('#view')!,engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.105,.145,.18,1);
const camera=new ArcRotateCamera('kit-camera',-Math.PI/2,.70,35,new Vector3(0,0,0),scene);
camera.attachControl(canvas,true);camera.minZ=.1;camera.lowerRadiusLimit=2;camera.upperRadiusLimit=65;camera.upperBetaLimit=1.48;camera.lowerBetaLimit=.12;camera.wheelPrecision=18;
const sun=new DirectionalLight('kit-sun',new Vector3(-.5,-1,.35),scene);sun.position.set(12,28,-18);sun.intensity=.75;
const hemi=new HemisphericLight('kit-fill',Vector3.Up(),scene);hemi.intensity=.5;hemi.groundColor=new Color3(.35,.40,.43);
const shadows=new ShadowGenerator(2048,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=.001;
const floor=MeshBuilder.CreateGround('gallery-floor',{width:200,height:200},scene);
const floorMat=new StandardMaterial('gallery-floor-mat',scene);floorMat.diffuseColor.set(.17,.23,.26);floorMat.specularColor.set(0,0,0);floor.material=floorMat;floor.receiveShadows=true;
let finish:KitFinish='clean',mode:KitAsset|'all'|'assembly'='all';
let roots:TransformNode[]=[];
const labels:{node:TransformNode;element:HTMLDivElement}[]=[];
const title=document.querySelector<HTMLElement>('#title')!,info=document.querySelector<HTMLElement>('#info')!;
const catalog=document.querySelector('#catalog')!;
for(const category of [...new Set(KIT_ASSETS.map(a=>a.category))]){
  const heading=document.createElement('h2');heading.textContent=category;catalog.append(heading);
  for(const asset of KIT_ASSETS.filter(a=>a.category===category)){
    const button=document.createElement('button');button.className='asset';button.textContent=asset.label;button.dataset.asset=asset.id;button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>show(asset.id));catalog.append(button);
  }
}
function place(id:KitAsset,x:number,z:number,yaw=0):TransformNode {
  const node=createEnvironmentProp(scene,id,finish,shadows);node.position.set(x,.015,z);node.rotation.y=yaw;roots.push(node);return node;
}
function show(next:typeof mode):void {
  mode=next;for(const root of roots)root.dispose();roots=[];
  for(const label of labels)label.element.remove();labels.length=0;
  for(const button of document.querySelectorAll<HTMLElement>('[data-asset]'))button.setAttribute('aria-pressed',String(button.dataset.asset===mode));
  if(mode==='all'){
    KIT_ASSETS.forEach((a,i)=>{
      const node=place(a.id,(i%6-2.5)*5.2,(2-Math.floor(i/6))*5.2);
      const element=document.createElement('div');element.className='tag';element.textContent=a.label;document.querySelector('#labels')!.append(element);labels.push({node,element});
    });
    camera.setTarget(new Vector3(0,0,0));camera.alpha=-Math.PI/2;camera.beta=.65;camera.radius=37;
    title.textContent='The starter collection';info.textContent='26 reusable pieces · select any item in the library';
  } else if(mode==='assembly'){
    place('wall-corner',2,2);
    place('wall-straight',-1,2);place('wall-straight',-3,2);place('wall-end',-4,2);
    place('wall-straight',2,5,Math.PI/2);place('wall-end',2,6);
    place('wall-broken',-6,2);place('rock-boulder',-5,5);place('plant-bush',-6,4);
    place('cover-crate',.3,2.8);place('cover-barrel',-.9,3);place('plant-fern',2.5,3);
    for(let i=0;i<4;i++)place('path-stones',-1.4,-4+i*2);
    place('stairs-stone',-1.4,4.4);place('cover-timber',-5,-1,Math.PI/2);place('plant-grass',-3.7,.8);place('patch-gravel',-3,-1);
    camera.setTarget(new Vector3(-1.7,.3,1));camera.alpha=-1.05;camera.beta=.7;camera.radius=19;
    title.textContent='A small outpost corner';info.textContent='Straight → corner → straight: shared 2 m wall sockets';
  } else {
    const root=place(mode,0,0);const box=root.getHierarchyBoundingVectors();const size=box.max.subtract(box.min);
    camera.setTarget(box.min.add(box.max).scale(.5));camera.alpha=-1.05;camera.beta=.92;camera.radius=Math.max(3.2,size.length()*1.7);
    title.textContent=KIT_ASSETS.find(a=>a.id===mode)!.label;
    const tris=root.getChildMeshes().reduce((n,m)=>n+m.getTotalIndices()/3,0);
    info.textContent=`${finish} · ${tris.toLocaleString()} triangles · ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
  }
}
document.querySelector('#all')!.addEventListener('click',()=>show('all'));
document.querySelector('#assembly')!.addEventListener('click',()=>show('assembly'));
document.querySelector<HTMLSelectElement>('#finish')!.addEventListener('change',e=>{finish=(e.target as HTMLSelectElement).value as KitFinish;show(mode);});
show('all');
engine.runRenderLoop(()=>{
  scene.render();const viewport=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
  for(const label of labels){
    const at=label.node.position.add(new Vector3(0,.04,-1.85));
    const p=Vector3.Project(at,Matrix.IdentityReadOnly,scene.getTransformMatrix(),viewport);
    label.element.style.left=`${p.x}px`;label.element.style.top=`${p.y}px`;label.element.style.display=p.z<0||p.z>1?'none':'block';
  }
});
window.addEventListener('resize',()=>engine.resize());
async function exportAsset(id:KitAsset,surface:KitFinish) {
  const exportScene=new Scene(engine);
  try {
    const root=createEnvironmentProp(exportScene,id,surface);
    const bounds=root.getHierarchyBoundingVectors(),size=bounds.max.subtract(bounds.min);
    const meshes=root.getChildMeshes();
    const glb=await GLTF2Export.GLBAsync(exportScene,id,{shouldExportNode:n=>n===root||n.isDescendantOf(root)});
    const bytes=Array.from(new Uint8Array(await (glb.glTFFiles[`${id}.glb`] as Blob).arrayBuffer()));
    return {bytes,triangles:meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),meshes:meshes.length,size:size.asArray(),bounds:{min:bounds.min.asArray(),max:bounds.max.asArray()},sockets:root.metadata.sockets??null};
  } finally {exportScene.dispose();}
}
Object.assign(window,{environmentKit:{scene,engine,camera,assets:KIT_ASSETS,finishes:KIT_FINISHES,show,setFinish:(f:KitFinish)=>{finish=f;document.querySelector<HTMLSelectElement>('#finish')!.value=f;show(mode);},exportAsset}});
