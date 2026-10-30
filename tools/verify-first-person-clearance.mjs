import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/clearance-test',r=>r.fulfill({contentType:'text/html',body:'<canvas width="256" height="256"></canvas>'}));
 await page.goto('http://127.0.0.1:5198/clearance-test');
 const result=await page.evaluate(async()=>{
  const {Engine,Scene,FreeCamera,Vector3,Color3,Color4,MeshBuilder,StandardMaterial,PBRMaterial}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {firstPersonClearance}=await import('/src/survivor/first-person-clearance.ts');
  const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true}),scene=new Scene(engine);
  scene.clearColor=new Color4(0,0,0,1);const camera=new FreeCamera('camera',Vector3.Zero(),scene);camera.minZ=.01;camera.setTarget(new Vector3(0,0,1));
  const reports=[];
  for(const Kind of [StandardMaterial,PBRMaterial]){
   let active=false;const arm=MeshBuilder.CreateBox('arm',{size:.1},scene);arm.position.z=.2;
   const material=new Kind('shared',scene);material.emissiveColor=Color3.White();material.disableLighting=true;arm.material=material;
   const sword=MeshBuilder.CreateBox('sword',{size:.1},scene);sword.position.set(.15,0,1);sword.material=material;
   const other=MeshBuilder.CreateBox('other-player',{size:.1},scene);other.position.z=.2;other.material=material;other.setEnabled(false);
   firstPersonClearance([arm,sword],()=>active,camera.position);await scene.whenReadyAsync();
   const pixel=async()=>{scene.render();const p=await engine.readPixels(128,128,1,1);return p[0];};
   const third=await pixel();active=true;const first=await pixel();
   const far=await engine.readPixels(171,128,1,1);
   arm.setEnabled(false);other.setEnabled(true);const shared=await pixel();
   reports.push({material:Kind.name,third,first,shared,far:far[0]});
   arm.dispose();sword.dispose();other.dispose();material.dispose();
  }
  scene.dispose();engine.dispose();return reports;
 });
 for(const r of result){assert.ok(r.third>100);assert.equal(r.first,0);assert.ok(r.shared>100);assert.ok(r.far>100,'Weapon outside clearance remains visible');}
 assert.deepEqual(errors,[]);console.log(result);
}finally{await browser.close();}
