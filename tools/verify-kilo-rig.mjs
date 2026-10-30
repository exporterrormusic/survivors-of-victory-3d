import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage();
 await page.goto(`${process.env.REVIEW_URL || 'http://127.0.0.1:5198'}/tools/review/character-setup.html`);
 await page.waitForSelector('[data-model]', {timeout:60000});
 const results = await page.evaluate(async () => {
  const {Engine,Scene,FreeCamera,Vector3,Quaternion} = await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {Chibi,loadChibiIndex} = await import('/src/chibi.ts');
  const {TwinStickRig} = await import('/src/survivor/rig.ts');
  const engine = new Engine(document.createElement('canvas'),true);
  const scene = new Scene(engine); new FreeCamera('camera',new Vector3(0,2,-5),scene);
  scene.useConstantAnimationDeltaTime=true;
  const index = await loadChibiIndex();
  const chibi = await Chibi.load(scene,index.variants.c361_00);
  const rig = new TwinStickRig(chibi);
  await scene.whenReadyAsync();
  const results=[];
  for(const posture of ['relaxed','aim','shot','reload']) for(const direction of [1,-1,0]) {
   const input={moveX:0,moveZ:direction,speed:direction?3:0,aimYaw:0,posture};
   for(let i=0;i<40;i++){rig.update(1/60,input);scene.render();rig.applyAim();}
   const legs=['Bip001 L Thigh','Bip001 R Thigh'].map(n=>chibi.joint(n));
   const first=legs.map(n=>n.rotationQuaternion.clone());
   const swing=[0,0];
   for(let i=0;i<90;i++) {
    rig.update(1/60,input);scene.render();rig.applyAim();
    legs.forEach((n,j)=>swing[j]=Math.max(swing[j],2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(first[j],n.rotationQuaternion))))));
   }
   results.push({posture,direction,swing,clip:rig.lower.current});
  }
  rig.dispose();scene.dispose();engine.dispose();return results;
 });
 for(const row of results) {
  assert.equal(row.clip,row.direction?'run':'idle');
  if(row.direction) assert.ok(row.swing.every(v=>v>.3),JSON.stringify(row));
 }
 console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
