import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/frozen-lake';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 if(process.env.FROZEN_PATCH_STORM)await page.route('**/src/survivor/storm-kit.ts*',async route=>{const r=await route.fetch();route.fulfill({response:r,body:(await r.text()).replace('this.panel.map(','(this.panel??[0,0,1]).map(')});});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`${process.env.FROZEN_REVIEW_URL??'http://localhost:5198'}/?run=test-range&zone=snow_day&time=day`);
 await page.waitForFunction(()=>window.game?.dressing?.theme==='frozen'&&window.game.scene.isReady(),null,{timeout:180000});
 await page.addStyleTag({content:'body * {visibility:hidden !important} canvas {visibility:visible !important}'});
 const report=await page.evaluate(()=>{
  const g=window.game,l=g.lake.lake;
  // A worn path, a fractured patch about to go, and one open hole with the player in it.
  // Three stress patches (hairlines, web, about to fail), then a chain collapse through a fourth.
  const H=56,G=112,paint=(cx,cz,r,v)=>{for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++){const d=Math.hypot(x,z);if(d>r)continue;const i=(Math.floor(cz+z)+H)*G+Math.floor(cx+x)+H;l.stress[i]=Math.max(l.stress[i],v*(1-.35*d/r));}l.dirty=true;};
  paint(-36,12,4,.15);paint(-27,12,4,.4);paint(-18,12,4,.85);
  paint(-26,28,7,.3);l.shatter(-26,28);
  g.player.position.set(-26,0,28);g.player.unstick();
  for(let i=0;i<30;i++)g.lake.update(1/30,g.player,g.targets,g.run);
  return {enabled:l.enabled,breaks:l.breaks,depth:l.depth({x:-26,z:28}),open:[...l.hole].filter(h=>h>0).length,sink:g.player.chibi.root.position.y};
 });
 assert.ok(report.enabled&&report.breaks>=1&&report.depth>.9&&report.open>60&&report.sink<-.4,JSON.stringify(report));
 for(const shot of [{name:'overview',eye:[0,95,-40],target:[0,0,2]},{name:'cracks',eye:[-25,26,-6],target:[-25,0,18]},{name:'shore',eye:[6,12,-8],target:[10,0,-6]}]){
  await page.evaluate(({eye,target})=>{const g=window.game,c=g.camera.camera;g.camera.update=()=>{};g.scene.fogEnabled=eye[1]<50;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));g.scene.render();},shot);
  await page.waitForTimeout(400);await page.screenshot({path:`${out}/${shot.name}.png`});
 }
 // Mid-collapse: the break spreading outward, chunks tipping under, water closing in.
 await page.evaluate(()=>{const g=window.game,l=g.lake.lake;
  const H=56,G=112;for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){const i=(Math.floor(12+z)+H)*G+Math.floor(-18+x)+H;if(Math.hypot(x,z)<=6)l.stress[i]=.5;}
  l.shatter(-18,12);for(let i=0;i<12;i++)g.lake.update(1/30,g.player,g.targets,g.run);
  const c=g.camera.camera;c.position.set(-18,14,0);c.setTarget(c.position.clone().set(-18,0,11));g.scene.render();});
 await page.waitForTimeout(300);await page.screenshot({path:`${out}/breaking.png`});
 // Switching maps always lands the player on the lift pad.
 const spawn=await page.evaluate(()=>{const g=window.game;g.player.position.set(-40,0,-30);g.setRangeEnvironment('sakura');g.player.position.set(-30,0,-30);g.setRangeEnvironment('frozen');return [g.player.position.x,g.player.position.z];});
 assert.deepEqual(spawn.map(v=>Math.round(v)),[0,0],'map swap spawns on the lift');
 assert.deepEqual(errors,[]);
 console.log('Frozen lake live: ice overlay, cracks, open hole and player sinking; no browser errors.',JSON.stringify(report));
}finally{await browser.close();}
