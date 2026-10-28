import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/storm-map/revision-natural-river';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.STORM_URL??'http://127.0.0.1:5198'}/?run=test-range&environment=storm`);
 await page.waitForFunction(()=>window.game?.storm?.field.enabled&&window.game.scene.isReady(),null,{timeout:180000});
 const checks=await page.evaluate(async()=>{
   const g=window.game;g.engine.stopRenderLoop();g.targets.setMovement('inactive');
   const {stormPlacements}=await import('/src/survivor/storm-layout.ts');
   const water=g.scene.getMeshByName('storm-river-water').getBoundingInfo().boundingBox;
   const ground=g.scene.getMeshByName('range-ground').getBoundingInfo().boundingBox;
   const f=g.storm.field;let maxStep=0,minStep=Infinity;
   for(const phase of [48.9,49.9,56.9,61.9]){
     f.elapsed=phase;for(let i=0;i<10;i++){const before=f.flowTime;f.update(.05);maxStep=Math.max(maxStep,f.flowTime-before);minStep=Math.min(minStep,f.flowTime-before);}
   }
   return {rocks:stormPlacements().filter(p=>p.asset.startsWith('rock-')).length,
     damMeshes:g.scene.meshes.filter(m=>/spillway|floodgate|cascade/.test(m.name)).map(m=>m.name),
     river:[water.minimum.z,water.maximum.z],ground:[ground.minimumWorld.z,ground.maximumWorld.z],
     cliffSections:g.scene.meshes.filter(m=>m.name==='storm-cliff-section').length,
     eastBlocked:!g.targets.navigation.clear({x:54,z:0},{x:59,z:0},.45),minStep,maxStep};
 });
 assert.equal(checks.rocks,12);assert.deepEqual(checks.damMeshes,[]);assert.ok(checks.cliffSections>20&&checks.eastBlocked);
 assert.ok(checks.river[0]<=-500&&checks.river[1]>=500&&checks.ground[1]>500);
 assert.ok(checks.minStep>=.05-1e-8&&checks.maxStep<=.0725+1e-8);
 await page.addStyleTag({content:'body *{visibility:hidden!important}canvas#game{visibility:visible!important}'});
 for(const shot of [
  {name:'river-normal',eye:[27,25,-17],at:[14,0,7],player:[13,0,8],phase:20},
  {name:'river-surge',eye:[27,25,-17],at:[14,0,7],player:[13,0,8],phase:51},
  {name:'north-river-mouth',eye:[22,25,25],at:[29,0,55],player:[29,0,46],phase:20},
  {name:'western-cliffs',eye:[-24,25,-12],at:[-53,8,6],player:[-48,0,6],phase:20},
  {name:'overview',eye:[0,125,-65],at:[0,0,4],player:[13,0,8],phase:20},
 ]){
  await page.evaluate(({eye,at,player,phase})=>{
   const g=window.game;g.player.position.set(...player);g.player.hp=g.player.maxHp;g.player.damageFlash=0;
   g.camera.update=()=>{};g.atmosphere.set('day','clear',true);g.atmosphere.update=()=>{};g.scene.fogDensity=.003;
   const c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...at));c.getViewMatrix(true);g.camera.focus.set(...at);
   g.storm.field.elapsed=phase;g.storm.update(0,g.player,g.targets,g.run);g.scene.render();
  },shot);
  await page.screenshot({path:`${out}/${shot.name}.png`});
 }
 await fs.writeFile(`${out}/checks.json`,JSON.stringify({checks,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify(checks,null,2));
}finally{await browser.close();}
