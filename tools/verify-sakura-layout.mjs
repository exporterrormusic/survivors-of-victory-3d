import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/sakura-layout';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/?run=test-range&zone=sakura_day&time=day');
 await page.waitForFunction(()=>window.game?.dressing?.theme==='sakura'&&window.game.scene.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{const g=window.game;g.scene.getEngine().stopRenderLoop();g.camera.update=()=>{};});
 await page.addStyleTag({content:'body * {visibility:hidden !important} canvas {visibility:visible !important}'});
 for(const shot of [
  {name:'overview',eye:[0,90,-38],target:[0,0,0]},
  {name:'shrine-court',eye:[14,23,13],target:[0,0,27]},
  {name:'rest-garden',eye:[-18,19,-9],target:[-18,0,9]},
  {name:'entrance',eye:[0,18,-43],target:[0,0,-22]},
 ]){
  await page.evaluate(({eye,target})=>{const g=window.game,c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));c.getViewMatrix(true);g.scene.render();},shot);
  await page.screenshot({path:`${out}/${shot.name}.png`});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/errors.json`,JSON.stringify(errors));
 console.log('Sakura layout: live shaders and scene ready; four review captures; no browser errors.');
}finally{await browser.close();}
