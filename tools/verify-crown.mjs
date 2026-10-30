import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage();
 await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
 await page.waitForSelector('[data-model]');
 const results = await page.evaluate(async () => {
  const {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,Color4}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {Chibi,loadChibiIndex,clipMuzzle}=await import('/src/chibi.ts');
  const {TwinStickRig}=await import('/src/survivor/rig.ts');
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=800;
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true}), index=await loadChibiIndex(), results=[];
  for(const variant of ['c330_00','c330_01','c330_02']) {
   const scene=new Scene(engine);new ArcRotateCamera('cam',.4,1.35,4.6,new Vector3(0,1,.3),scene);
   scene.clearColor=new Color4(.14,.17,.22,1);new HemisphericLight('light',new Vector3(0,1,1),scene);
   const chibi=await Chibi.load(scene,index.variants[variant]); const rig=new TwinStickRig(chibi);
   await scene.whenReadyAsync();
   scene.onAfterAnimationsObservable.add(()=>rig.applyAim());
   for(const posture of ['aim','shot']) for(const moveZ of [0,1,-1]) for(const aimYaw of [0,1.2,-2.4]) {
    for(let f=0;f<30;f++){rig.update(1/60,{moveX:0,moveZ,speed:moveZ?3:0,aimYaw,posture});scene.render();}
    const muzzle=rig.muzzle(new Vector3());
    const chain=[];for(let n=chibi.joint('B_weapon_01');n;n=n.parent)chain.unshift(n);for(const n of chain)n.computeWorldMatrix(true);
    const joint=chibi.joint('B_weapon_01'), tip=Vector3.TransformCoordinates(new Vector3(.9769,-.0028,.007),joint.getWorldMatrix());
    const axis=Vector3.TransformNormal(new Vector3(1,0,0),joint.getWorldMatrix()).normalize();
    const ref=clipMuzzle(chibi.meta,'cover_shot'), muzzleJoint=chibi.joint(ref.joint);
    muzzleJoint.computeWorldMatrix(true);
    const measured=Vector3.TransformCoordinates(Vector3.FromArray(ref.offset),muzzleJoint.getWorldMatrix());
    const neck=chibi.joint('Bip001 Neck'), spine=chibi.joint('Bip001 Spine');
    neck.computeWorldMatrix(true);spine.computeWorldMatrix(true);
    const torsoUp=neck.getAbsolutePosition().subtract(spine.getAbsolutePosition()).normalize();
    results.push({variant,posture,moveZ,aimYaw,torsoTilt:Math.acos(Math.min(1,torsoUp.y))*180/Math.PI,pitch:Math.asin(axis.y)*180/Math.PI,tipError:Vector3.Distance(muzzle,tip),transformError:Vector3.Distance(muzzle,measured),image:posture==='aim'&&moveZ===0&&aimYaw===0?canvas.toDataURL():undefined});
   }rig.dispose();scene.dispose();
  }engine.dispose();return results;
 });
 for(const result of results){
  assert.ok(result.torsoTilt<1, `Crown must stand upright: ${JSON.stringify({...result,image:undefined})}`);
  assert.ok(Math.abs(result.pitch)<15, `Lance must point forward: ${JSON.stringify(result)}`);
  assert.ok(result.tipError<.025, `Shot must leave lance tip: ${JSON.stringify(result)}`);
  assert.ok(result.transformError<1e-5, `Muzzle transform must be current: ${JSON.stringify(result)}`);
 }
 await mkdir('artifacts/crown-hold',{recursive:true});
 for(const result of results)if(result.image)await writeFile(`artifacts/crown-hold/${result.variant}.png`,Buffer.from(result.image.split(',')[1],'base64'));
 console.log(`PASS: ${results.length} Crown aim/fire cases across all skins, headings, idle, forward and backward movement.`);
}finally{await browser.close();}
