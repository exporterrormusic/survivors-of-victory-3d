import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.FROZEN_REVIEW_URL??'http://127.0.0.1:5297',out='artifacts/frozen-vault';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`${base}/?run=test-range&zone=snow_day&time=day`);
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const report=await page.evaluate(()=>{
  const g=window.game;g.engine.stopRenderLoop();g.snow.update(1);g.camera.update=()=>{};
  const e=g.elevator,result={vault:e.isVault,origin:e.root.position.asArray(),snow:g.snow.enabled,snowDepth:g.snow.field.depth(35,30),meshes:g.dressing.meshes.length,windTrees:g.dressing.meshes.filter(m=>m.metadata?.wind).length};
  g.player.position.copyFrom(e.root.position);
  e.command('descend');let minimumY=0;
  for(let i=0;i<90;i++){e.update(.1);g.liftRide.update();minimumY=Math.min(minimumY,g.player.position.y);}
  result.extracted=g.liftRide.ended;result.minimumY=minimumY;result.sealed=e.state.action;
  e.command('rise');for(let i=0;i<90;i++){e.update(.1);g.liftRide.update();}
  result.reopened=e.state.gateOpen===1&&!g.player.transported&&!g.liftRide.ended;
  g.player.position.set(-18,0,0);
  return result;
 });
 assert.ok(report.vault&&report.extracted&&report.reopened&&report.snow&&report.snowDepth>.08);assert.deepEqual(report.origin,[0,0,12]);assert.equal(report.minimumY,0);assert.equal(report.sealed,'sealed');
 await page.addStyleTag({content:'body * {visibility:hidden !important} canvas {visibility:visible !important}'});
 for(const shot of [
  {name:'overview',eye:[0,190,-85],target:[0,0,0]},
  {name:'mountain-forest-border',eye:[-27,22,33],target:[-42,6,60]},
  {name:'tunnel-roof',eye:[-37,24,-24],target:[0,2,0]},
  {name:'vault-closed',eye:[0,4,-4],target:[0,3,10],closed:true},
  {name:'vault-open',eye:[0,4,-4],target:[0,3,10]},
 ]){
  await page.evaluate(({eye,target,name,closed})=>{
   const g=window.game;g.elevator.command(closed?'close':'open');g.elevator.update(2);
   g.scene.fogEnabled=name!=='overview';const c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));
   for(const mesh of [...g.dressing.meshes,...g.elevator.root.getChildMeshes()])mesh.visibility=1;
   c.getViewMatrix(true);g.scene.render();
  },shot);
  await page.waitForFunction(()=>window.game.scene.isReady(),null,{timeout:60000});
  await page.evaluate(()=>window.game.scene.render());await page.screenshot({path:`${out}/${shot.name}.png`});
 }
 const restored=await page.evaluate(()=>{const g=window.game;g.setRangeEnvironment('sakura');return !g.elevator.isVault&&g.elevator.platform.isEnabled();});assert.ok(restored,'other maps retain the elevator');
 console.log('Vault extraction, ground-level transport, door reopening and normal-elevator restoration passed.');
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/visual-verification.json`,JSON.stringify({report,errors},null,2));
 if(!process.env.FROZEN_VISUAL_ONLY){
 await page.goto(`${base}/?run=test-range&mission=survival_round&zone=snow_day&time=day`);
 await page.waitForFunction(()=>window.game?.scene?.isReady()&&window.game.sortie,null,{timeout:180000});
 const survival=await page.evaluate(()=>{
  const g=window.game;g.engine.stopRenderLoop();g.player.takeDamage=()=>false;
  for(let i=0;i<90&&g.sortie.arriving;i++){g.elevator.update(.1);g.sortie.update(.1);}
  const result={arrived:!g.sortie.arriving,position:g.player.position.asArray(),transported:g.player.transported};
  g.player.position.set(-18,0,0);
  const supply=g.sortie.supply;supply.update(.1,60,true);
  for(let i=0;i<170;i++){g.elevator.update(.1);supply.update(.1,60+i*.1,true);}
  result.squad=supply.count;result.crate=supply.crateWaiting;result.crateHeight=supply.crate.position.y;
  result.allyHeights=supply.members.map(a=>a.position.y);return result;
 });
 assert.ok(survival.arrived&&!survival.transported);assert.equal(survival.position[1],0);assert.equal(survival.position[2],12);
 assert.ok(survival.squad>0&&survival.crate);assert.equal(survival.crateHeight,.35);assert.ok(survival.allyHeights.every(y=>y===0));
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/verification.json`,JSON.stringify({report,survival,errors},null,2));
 console.log('Survival arrival, squad delivery and health crate passed at the mountain vault; no browser errors.');
 }
}finally{await browser.close();}
