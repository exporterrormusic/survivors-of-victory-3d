import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.STORM_URL??'http://127.0.0.1:5198'}/?run=test-range&mission=survival_round&zone=storm`);
 await page.waitForFunction(()=>window.game?.sortie&&window.game.scene.isReady(),null,{timeout:240000});
 const result=await page.evaluate(()=>{
  const g=window.game;g.engine.stopRenderLoop();const e=g.elevator,s=g.sortie,p=g.player;
  const arrival={x:p.position.x,z:p.position.z};
  for(let i=0;i<100;i++){e.update(.1);s.update(.1);}
  const phase=s.round.phase;
  p.position.set(-24,0,-43);s.supply.nextDelivery=s.round.elapsed;
  for(let i=0;i<230;i++){e.update(.1);s.supply.update(.1,s.round.elapsed,true);}
  const crate={x:s.supply.crate.position.x,z:s.supply.crate.position.z,ready:s.supply.crateWaiting};
  const riders=s.supply.allies.map(a=>({x:a.position.x,z:a.position.z,riding:a.riding}));
  const oldOriginClear=g.targets.navigation.clear({x:0,z:0},{x:0,z:0},.45);
  return {arrival,phase,crate,riders,oldOriginClear,radius:g.targets.navigation.extent};
 });
 console.log(JSON.stringify(result,null,2));
 assert.deepEqual(result.arrival,{x:-24,z:-34});assert.equal(result.phase,'survive');
 assert.ok(result.crate.ready);assert.deepEqual([result.crate.x,result.crate.z],[-24,-34]);
 assert.ok(result.riders.length>0&&result.riders.every(a=>!a.riding&&a.x< -15&&a.z< -25));
 assert.equal(result.oldOriginClear,true);assert.equal(result.radius,58);assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts/storm-map',{recursive:true});await fs.writeFile('artifacts/storm-map/arrival-verification.json',JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
