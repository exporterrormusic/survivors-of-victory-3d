import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.STORM_URL??'http://127.0.0.1:5198'}/?run=test-range&environment=storm`);
 await page.waitForFunction(()=>window.game?.storm?.field.enabled&&window.game.scene.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{
   const g=window.game;g.targets.setMovement('inactive');g.player.position.set(13,0,8);g.camera.setDistance(28);g.camera.snap(g.player.position);g.storm.field.elapsed=51;
   g.storm.update(0,g.player,g.targets,g.run);g.engine.stopRenderLoop();g.scene.render();
 });
 await page.screenshot({path:'artifacts/storm-map/gameplay-storm.png'});
 assert.deepEqual(errors,[]);await fs.writeFile('artifacts/storm-map/shader-smoke.json',JSON.stringify({passed:true,errors},null,2));
 console.log('Final river and spillway shaders compiled; storm gameplay capture saved; no browser errors.');
}finally{await browser.close();}
