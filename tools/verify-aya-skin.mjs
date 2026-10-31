import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=aya');await page.waitForFunction(()=>window.reviewReady);
 const skins=await page.evaluate(async()=>{
  const {characterSkins}=await import('/src/frontend/profile/Skins.ts');const {createSkinShowroom}=await import('/src/frontend/ui/SkinShowroom.ts');
  const skins=characterSkins('wells');document.body.innerHTML='';document.body.style.cssText='margin:20px;background:#101923;color:white';
  const show=createSkinShowroom('wells','equip',()=>{},'aya');document.body.append(show.element);return skins;
 });
 assert.equal(skins[0].id,'wells_research');assert.ok(skins.some(s=>s.id==='c302_00'));assert.equal(skins.find(s=>s.id==='aya').icon,'chibi/aya_portrait.png');
 await page.waitForSelector('[data-model="aya"]',{timeout:60000});
 assert.ok(await page.locator('img[src$="aya_portrait.png"]').evaluate(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'artifacts/aya/skin-selection.png'});
 const aim=await page.evaluate(async()=>{
  const {Engine,Scene,Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');const {TwinStickRig}=await import('/src/survivor/rig.ts');
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;document.body.append(canvas);const e=new Engine(canvas,true);const s=new Scene(e);const index=await loadChibiIndex();const ch=await Chibi.load(s,index.variants.aya,'weapon');const rig=new TwinStickRig(ch,undefined,'weapon');let maxTilt=0,maxAimError=0;
  for(const posture of ['aim','shot','reload'])for(const move of [0,1,-1])for(let frame=0;frame<60;frame++){
   rig.update(1/60,{moveX:move,moveZ:0,speed:Math.abs(move)*3,aimYaw:.4,posture});
   for(const g of s.animationGroups)if(g.weight>0){g.pause();g.goToFrame(g.from+(g.to-g.from)*frame/60);}
   rig.applyAim();
   const up=Vector3.TransformNormal(Vector3.Up(),ch.joint('Bip001 Head').computeWorldMatrix(true)).normalize();maxTilt=Math.max(maxTilt,Math.acos(Math.min(1,up.y)));
   if(frame>15&&posture!=='reload'){let d=rig.gunYaw()-.4;while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;maxAimError=Math.max(maxAimError,Math.abs(d));}
  }
  rig.dispose();ch.dispose();s.dispose();e.dispose();canvas.remove();return {maxTilt,maxAimError};
 });
 assert.ok(aim.maxTilt<.01,JSON.stringify(aim));assert.ok(aim.maxAimError<.01,JSON.stringify(aim));assert.deepEqual(errors,[]);
 await fs.writeFile('artifacts/aya/skin-validation.json',JSON.stringify({skins,aim,errors},null,2));console.log(JSON.stringify({skins:skins.length,aim,errors}));
}finally{await browser.close();}
