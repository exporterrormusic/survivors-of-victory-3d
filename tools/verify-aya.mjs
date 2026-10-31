import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=aya');
 await page.waitForFunction(()=>window.reviewReady,{timeout:60000});
 const clips=await page.evaluate(async()=>{
  const {EngineStore}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const scene=EngineStore.LastCreatedScene;window.ayaScene=scene;const result={};
  for(const g of scene.animationGroups){
   for(const other of scene.animationGroups)other.stop();g.start(true);
   for(const t of [0,.25,.5,.75,1]){
    g.goToFrame(g.from+(g.to-g.from)*t);scene.render();
    for(const n of scene.transformNodes)if(!Array.from(n.getWorldMatrix().m).every(Number.isFinite))throw Error('Nonfinite '+g.name+' '+n.name);
   }
   result[g.name]=g.targetedAnimations.length;
  }
  return result;
 });
 for(const clip of ['idle','run','aim_idle','walk']){
  await page.evaluate(clip=>{const s=window.ayaScene;for(const g of s.animationGroups)g.stop();const g=s.animationGroups.find(g=>g.name===clip);g.start(true);g.goToFrame((g.from+g.to)/2);g.pause();s.render();},clip);
  await page.screenshot({path:`artifacts/aya/runtime-${clip}.png`});
 }
 assert.equal(Object.keys(clips).length,15);assert.deepEqual(errors,[]);
 // Explicitly inspect the rear waist from above: front-only views missed the
 // spine/pelvis separation at the upper edge of the belt.
 for(const clip of ['idle','run','aim_idle','cover_reload']){
  await page.evaluate(clip=>{
   const s=window.ayaScene;for(const g of s.animationGroups)g.stop();const g=s.animationGroups.find(g=>g.name===clip);g.start(true);g.goToFrame((g.from+g.to)/2);g.pause();
   const c=s.activeCamera;c.alpha=Math.PI/2;c.beta=.38;c.radius=2.7;c.target.set(0,.9,0);s.render();
  },clip);
  await page.screenshot({path:`artifacts/aya/overhead-${clip}.png`});
 }
 await fs.writeFile('artifacts/aya/runtime-validation.json',JSON.stringify({clips,errors,samplesPerClip:5},null,2));
 console.log('Aya: all 15 clips loaded; 75 pose samples finite; no browser errors.');
}finally{await browser.close();}
