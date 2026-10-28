import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const tag=process.argv[2]??'before';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5199/?run=test-range&zone=volcano_day&time=day&enemies=inactive');
 await page.waitForFunction(()=>window.game?.volcano&&game.scene.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{game.volcano.erupting=false;game.engine.stopRenderLoop();game.camera.update=()=>{};});
 await fs.mkdir('artifacts/caldera',{recursive:true});
 for(const [name,eye,target] of [['field',[-18,17,-36],[-18,0,-17]],['summit',[27,43,-40],[74,17,18]],['overview',[-24,80,-80],[13,1,8]]]){
  await page.evaluate(({eye,target})=>{const g=game,c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));c.getViewMatrix(true);g.scene.render();},{eye,target});
  await page.waitForTimeout(250);await page.evaluate(()=>game.scene.render());
  await page.screenshot({path:`artifacts/caldera/${tag}-${name}.png`});
 }
 console.log({tag,errors});
}finally{await browser.close();}
