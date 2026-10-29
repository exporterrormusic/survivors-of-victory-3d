import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/dorothy', {recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const results=await page.evaluate(async()=>{
  const g=window.game;g.engine.stopRenderLoop();
  g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  const {Chibi}=await import('/src/chibi.ts');
  const {TwinStickRig}=await import('/src/survivor/rig.ts');
  const {Scene,FreeCamera,Vector3,HemisphericLight}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const testScene=new Scene(g.engine);testScene.activeCamera=new FreeCamera('test-camera',new Vector3(0,2,-5),testScene);
  testScene.activeCamera.setTarget(new Vector3(0,1,0));new HemisphericLight('test-light',new Vector3(0,1,0),testScene);
  testScene.useConstantAnimationDeltaTime=true;
  const index=await (await fetch('/chibi/index.json')).json();
  const results=[];
  for(const id of ['c233_00','c233_01','c233_02','c234_00']){
   const c=await Chibi.load(testScene,{...index.variants[id],variant:id});
   const rig=new TwinStickRig(c);
   await testScene.whenReadyAsync();
   const head=c.joint('Bip001 Head');const V=c.root.position.constructor;
   const records=[];
   let screenshot;
   for(const posture of ['relaxed','aim','reload']){
    rig.legYaw=Math.PI;
    for(let i=0;i<60;i++){
     rig.update(1/60,{moveX:0,moveZ:0,speed:0,aimYaw:Math.PI,posture});
     testScene.render();rig.applyAim();
    }
    const forward=V.TransformNormal(new V(0,1,0),head.computeWorldMatrix(true));
    if(posture==='relaxed') { testScene.render(); screenshot=g.engine.getRenderingCanvas().toDataURL(); }
    records.push({posture,headYaw:Math.atan2(forward.x,forward.z),gunYaw:rig.gunYaw(),upper:rig.upper.current,lower:rig.lower.current});
   }
   const running=[];
   for(const posture of ['relaxed','aim','shot','reload']){
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
     for(let i=0;i<35;i++){
      rig.update(1/60,{moveX:Math.sin(yaw),moveZ:Math.cos(yaw),speed:6,aimYaw:yaw,posture});
      testScene.render();rig.applyAim();
     }
     const left=c.joint('Bip001 L Thigh'),right=c.joint('Bip001 R Thigh');
     left.computeWorldMatrix(true);right.computeWorldMatrix(true);
     const axis=left.getAbsolutePosition().subtract(right.getAbsolutePosition());
     const hipYaw=Math.atan2(axis.z,-axis.x);
     const error=Math.abs(Math.atan2(Math.sin(hipYaw-yaw),Math.cos(hipYaw-yaw)));
     running.push({posture,yaw,hipYaw,error});
    }
   }
   results.push({id,records,running,screenshot});rig.dispose();c.dispose();
  }
  // The elevator path must still apply the pose, while blocking combat callbacks.
  let applied=0,fired=0;const original=g.player.rig.applyAim;
  g.player.rig.applyAim=()=>applied++;g.player.kit.fire=()=>fired++;
  g.player.transported=true;g.player.pendingShot=true;g.player.afterAnimation();
  g.player.rig.applyAim=original;
  return {models:results,transport:{applied,fired}};
 });
 for(const model of results.models){await writeFile(`artifacts/dorothy/${model.id}-idle.png`,Buffer.from(model.screenshot.split(',')[1],'base64'));delete model.screenshot;}
 console.log(JSON.stringify(results,null,2));
 await writeFile('artifacts/dorothy/rig-verification.json',JSON.stringify({results,errors},null,2));
 assert.equal(results.transport.applied,1);assert.equal(results.transport.fired,0);
 for(const model of results.models){
  // Authored stride sway reaches 17 degrees; the erroneous stance offset was ~65 degrees.
  for(const pose of model.running)assert.ok(pose.error<.35,`${model.id} ${pose.posture} running hips: ${pose.error}`);
  for(const pose of model.records){assert.ok(Number.isFinite(pose.headYaw)&&Number.isFinite(pose.gunYaw));}
  const idle=model.records[0];
  assert.ok(Math.abs(Math.atan2(Math.sin(idle.headYaw-Math.PI),Math.cos(idle.headYaw-Math.PI)))<.2,`${model.id} elevator facing`);
  assert.equal(model.records[1].upper,'aim_idle');
  const yaw=model.records[1].gunYaw;assert.ok(Math.abs(Math.atan2(Math.sin(yaw-Math.PI),Math.cos(yaw-Math.PI)))<.1,`${model.id} aim direction`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
