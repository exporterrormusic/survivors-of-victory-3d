import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
const out='artifacts/wells';
const bytes=await fs.readFile('public/chibi/wells_research.glb');
const validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});
await fs.writeFile(`${out}/gltf-validation.json`,JSON.stringify(validation,null,2));
assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages.slice(0,8)));
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error' && /shader|compil|effect/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=wells_research');
 await page.waitForFunction(()=>window.reviewReady,{timeout:60000});
 const result=await page.evaluate(async()=>{
  const {Engine,Scene,ArcRotateCamera,HemisphericLight,Vector3,Color4}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');
  const {TwinStickRig}=await import('/src/survivor/rig.ts');
  const {characterSkins}=await import('/src/frontend/profile/Skins.ts');
  const skins=characterSkins('wells');
  if(skins[0]?.id!=='wells_research' || skins[0]?.cost!==0)throw Error('Research Uniform must be Wells default');
  if(!skins.slice(1).some(s=>s.id==='c302_00' && s.name==='Product 08'))throw Error('Product 08 must remain an alternate skin');
  document.body.innerHTML='<canvas id="wells" width="1000" height="1000" style="width:100vw;height:100vh"></canvas>';
  const canvas=document.getElementById('wells'); const engine=new Engine(canvas,true,{preserveDrawingBuffer:true}); const scene=new Scene(engine);
  scene.clearColor=new Color4(.12,.15,.2,1);
  const camera=new ArcRotateCamera('review',Math.PI/2,1.35,3.5,new Vector3(0,1.1,0),scene); new HemisphericLight('key',new Vector3(.3,1,-.5),scene).intensity=1.3;
  const index=await loadChibiIndex(); const chibi=await Chibi.load(scene,index.variants.wells_research,'weapon');
  const clips={};
  for(const name of Object.keys(index.variants.wells_research.clips)) {
   const g=chibi.animationGroup(name); if(!g)throw Error('Missing '+name);
   chibi.play(name,{fade:0,loop:true}); chibi.update(.016); g.goToFrame((g.from+g.to)/2); scene.render();
   const bangs=g.targetedAnimations.filter(t=>t.target.name?.startsWith('Wells_Bang_'));
   const moving=bangs.filter(t=>{const k=t.animation.getKeys(); return k.length>1&&k.some(v=>JSON.stringify(v.value)!==JSON.stringify(k[0].value));});
   if(moving.length<6)throw Error('Bangs not animated: '+name+' '+moving.length);
   clips[name]={tracks:g.targetedAnimations.length,bangTracks:moving.length};
  }
  const rig=new TwinStickRig(chibi,undefined,'weapon');
  const aimObserver=scene.onAfterAnimationsObservable.add(()=>rig.applyAim());
  for(const posture of ['relaxed','aim','shot','reload']) for(const moveZ of [0,1,-1]) {
   for(let n=0;n<20;n++){rig.update(1/60,{moveX:0,moveZ,speed:moveZ?3:0,aimYaw:0,posture});scene.render();}
   for(const n of scene.transformNodes)if(!Array.from(n.getWorldMatrix().m).every(Number.isFinite))throw Error('Invalid '+n.name);
  }
  scene.onAfterAnimationsObservable.remove(aimObserver);
  rig.dispose(); chibi.play('idle',{fade:0,loop:true}); chibi.update(.016);
  const group=chibi.animationGroup('idle'); group.goToFrame(group.from); scene.render();
  window.wellsReview={scene,chibi,camera,engine};
  engine.runRenderLoop(()=>scene.render());
  return {clips,meshes:chibi.meshes.length,skins};
 });
 await page.waitForTimeout(500);
 await page.screenshot({path:`${out}/runtime-idle.png`});
 for(const name of ['run','aim_idle','cover_reload']) {
  await page.evaluate(name=>{const {chibi,scene}=window.wellsReview; chibi.play(name,{fade:0,loop:true}); chibi.update(.016);const g=chibi.animationGroup(name);g.goToFrame((g.from+g.to)/2);scene.render();},name);
  await page.waitForTimeout(100); await page.screenshot({path:`${out}/runtime-${name}.png`});
 }
 await page.evaluate(()=>{const {chibi,camera,scene}=window.wellsReview; chibi.play('idle',{fade:0,loop:true});chibi.update(.016);const g=chibi.animationGroup('idle');g.goToFrame(g.from);camera.alpha+=Math.PI;scene.render();});
 await page.waitForTimeout(100); await page.screenshot({path:`${out}/runtime-back.png`});
 // Close side views catch underarm intersections hidden by the rifle from
 // the normal front camera. Cover both sides to avoid handedness ambiguity.
 for(const name of ['idle','aim_idle','run','cover_reload']) for(const [side,angle] of [['left',.35],['right',Math.PI-.35]]) {
  await page.evaluate(({name,angle})=>{
   const {chibi,camera,scene}=window.wellsReview;
   chibi.play(name,{fade:0,loop:true});chibi.update(.016);
   const g=chibi.animationGroup(name);g.goToFrame((g.from+g.to)/2);g.pause();
   camera.alpha=angle;camera.beta=1.4;camera.radius=1.65;camera.minZ=.02;camera.target.set(0,1.08,0);scene.render();
  },{name,angle});
  await page.waitForTimeout(100);await page.screenshot({path:`${out}/underarm-${side}-${name}.png`});
 }
 await page.evaluate(()=>{
  const {chibi,camera,scene}=window.wellsReview;
  chibi.play('aim_idle',{fade:0,loop:true});chibi.update(.016);const g=chibi.animationGroup('aim_idle');g.goToFrame((g.from+g.to)/2);g.pause();
  for(const mesh of chibi.meshes)if(mesh.name.includes('weapon'))mesh.isVisible=false;
  camera.alpha=Math.PI/2;camera.beta=1.4;camera.radius=1.9;camera.minZ=.02;camera.target.set(0,.95,0);scene.render();
 });
 await page.waitForTimeout(100);await page.screenshot({path:`${out}/torso-hip-coverage.png`});
 await page.evaluate(()=>{const {camera,scene}=window.wellsReview;camera.alpha=.35;scene.render();});
 await page.waitForTimeout(100);await page.screenshot({path:`${out}/torso-hip-front.png`});
 await page.evaluate(()=>{for(const mesh of window.wellsReview.chibi.meshes)if(mesh.name.includes('weapon'))mesh.isVisible=true;});
 const clock=await page.evaluate(()=>{
  const {chibi,camera}=window.wellsReview;
  const material=chibi.meshes.map(m=>m.material).find(m=>m?.name==='c302_00');
  const plugin=material?.pluginManager?.getPlugin('WellsClockEyes');
  if(!plugin)throw Error('Missing Wells clock-eye material plugin');
  camera.alpha=Math.PI/2; camera.beta=Math.PI/2; camera.radius=1.50; camera.minZ=.02; camera.target.set(0,1.70,0);
  chibi.play('idle',{fade:0,loop:true});chibi.update(.016);
  const group=chibi.animationGroup('idle'); group.goToFrame(group.from);group.pause();
  window.wellsClock=plugin;
  // Freeze cloth for exact pixel comparisons of eye-only fade states.
  window.wellsReview.chibi.root.metadata.wellsCoatPhysics.enabled=false;
  return {plugin:plugin.name};
 });
 for(const [name,time] of [['off',0],['fading-in',4.6],['on',5.8],['hands-turned',6.6],['faded-out',8.2]]) {
  await page.evaluate(t=>{window.wellsClock.previewTime=t;window.wellsReview.scene.render();},time);
  await page.waitForTimeout(100);await page.screenshot({path:`${out}/clock-eyes-${name}.png`});
 }
 const eyeOff=await fs.readFile(`${out}/clock-eyes-off.png`);
 const eyeOn=await fs.readFile(`${out}/clock-eyes-on.png`);
 assert.deepEqual(await fs.readFile(`${out}/clock-eyes-faded-out.png`),eyeOff,'Fade must restore the original eyes');
 assert.notDeepEqual(eyeOn,eyeOff,'Clock must be visible during its active phase');
 assert.notDeepEqual(await fs.readFile(`${out}/clock-eyes-hands-turned.png`),eyeOn,'Clock hands must rotate');
 assert.deepEqual(errors,[]);
 const shaderInfo=await page.evaluate(()=>{
  const mesh=window.wellsReview.chibi.meshes.find(m=>m.material?.name==='c302_00');
  const shader=mesh.subMeshes[0].effect.fragmentSourceCode;
  return {hasClock:shader.includes('wellsClockLight'),hasAlbedo:shader.includes('#define ALBEDO'),shader};
 });
 await fs.writeFile(`${out}/clock-shader.txt`,shaderInfo.shader);
 await fs.writeFile(`${out}/runtime-validation.json`,JSON.stringify({result,clock,errors},null,2));
 console.log('PASS: GLB validation, 15 clips, six animated bang bones, movement/aim/fire/reload rig, clock visibility, rotating hands, and complete fade-out.');
} finally {await browser.close();}
