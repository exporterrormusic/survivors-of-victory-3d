import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5198/tools/review/character-setup.html');await page.waitForSelector('[data-model]');
 const results=await page.evaluate(async()=>{
 const {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,Quaternion}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
 const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');const {TwinStickRig}=await import('/src/survivor/rig.ts');
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=900;
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true}),scene=new Scene(engine);
 new ArcRotateCamera('camera',-1.2,1.1,5.5,new Vector3(0,1,0),scene);new HemisphericLight('light',Vector3.Up(),scene);
 const index=await loadChibiIndex(),chibi=await Chibi.load(scene,index.variants.c223_01,'head','body'),rig=new TwinStickRig(chibi,undefined,'head');
 scene.onAfterAnimationsObservable.add(()=>rig.applyAim());await scene.whenReadyAsync();
 const draw=()=>{for(let f=0;f<40;f++){rig.update(1/60,{moveX:0,moveZ:0,speed:0,aimYaw:Math.PI,posture:'aim'});scene.render();}return canvas.toDataURL();};
 const images=[['all',draw()]];
 const mesh=chibi.meshes.find(m=>m.name==='c223_01_weapon_skin');
 const joints=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights');
 const used=new Set();for(const vertex of mesh.getIndices())for(let k=0;k<4;k++)if(weights[vertex*4+k]>.5)used.add(joints[vertex*4+k]);
 const visibleBones=mesh.skeleton.bones.filter(b=>used.has(b.getIndex())).map(b=>b.name);
 rig.update(1/60,{moveX:0,moveZ:0,speed:0,aimYaw:Math.PI,posture:'shot'});scene.render();
 const shot=scene.animationGroups.find(g=>g.name==='cover_shot@upper');
 const source=chibi.animationGroup('cover_shot'),aim=chibi.animationGroup('aim_idle'),root=chibi.joint('root_shawl');
 let maxRibbonRatio=0,checkedKeys=0;
 for(const track of shot.targetedAnimations){
  if(track.target!==root&&!track.target.isDescendantOf?.(root))continue;
  const match=g=>g.targetedAnimations.find(t=>t.target===track.target&&t.animation.targetProperty===track.animation.targetProperty);
  const base=match(aim)?.animation.getKeys()[0]?.value, original=match(source)?.animation.getKeys();
  if(!base||!original)continue;
  const distance=(a,b)=>a instanceof Quaternion?2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(a,b)/(a.length()*b.length())))):Vector3.Distance(a,b);
  track.animation.getKeys().forEach((key,i)=>{const full=distance(base,original[i].value);if(full>.01){maxRibbonRatio=Math.max(maxRibbonRatio,distance(base,key.value)/full);checkedKeys++;}});
 }
 rig.dispose();scene.dispose();engine.dispose();return {images,visibleBones,maxRibbonRatio,checkedKeys};
 });await mkdir('artifacts/wuwei',{recursive:true});for(const [name,image]of results.images)await writeFile('artifacts/wuwei/'+name+'.png',Buffer.from(image.split(',')[1],'base64'));
 delete results.images;console.log(results);
 assert.ok(!results.visibleBones.includes('B_acc_prop_12'),'Black orb must be removed');
 assert.ok(results.visibleBones.includes('Bone_circle_B')&&results.visibleBones.includes('Bone_circle_S'),'Both luminous rings must remain');
 assert.ok(results.checkedKeys>0&&results.maxRibbonRatio<.16,'Ribbon firing movement must be reduced to 15%');
}finally{await browser.close();}
