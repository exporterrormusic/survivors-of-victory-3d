import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5194/?run=test-range&mission=relay_run',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.game?.scene?.isReady()&&window.game.run.time>.2,null,{timeout:180000});
 await fs.mkdir('artifacts/relay-run',{recursive:true});
 await page.screenshot({path:'artifacts/relay-run/arrival.png'});
 const initial=await page.evaluate(()=>{
  const g=window.game;g.player.transported=true;
  return {count:g.targets.targets.length,step:g.sortie.route.step,burst:g.run.burst,
   collision:g.targets.navigation.clear({x:0,z:-20},{x:0,z:0},.6),
   pass:g.targets.navigation.clear({x:21,z:-19},{x:21,z:0},.6)};
 });
 assert.equal(initial.count,3);assert.equal(initial.step,0);assert.equal(initial.burst,100);
 assert.equal(initial.collision,false);assert.equal(initial.pass,true);
 await page.evaluate(()=>{const g=window.game;g.player.hp=40;g.player.position.set(-24,0,-23);});
 await page.waitForFunction(()=>window.game.sortie.route.healingUsed);
 assert.ok(await page.evaluate(()=>window.game.player.hp>40));
 for(const [step,x,z] of [[1,21,-19],[2,21,0],[3,-20,0],[4,-20,20],[5,0,24]]){
  await page.evaluate(({x,z})=>window.game.player.position.set(x,0,z),{x,z});
  await page.waitForFunction(step=>window.game.sortie.route.step===step,step);
 }
 assert.equal(await page.evaluate(()=>window.game.sortie.ended),false);
 await page.screenshot({path:'artifacts/relay-run/tower.png'});
 await page.evaluate(()=>{const g=window.game;const boss=g.targets.targets.find(t=>t.maxHp===1350);if(!boss)throw Error('Missing Hard Hat');g.run.damage(boss,100000,'effect');});
 await page.waitForSelector('.relay-result');
 assert.match(await page.locator('.relay-result').innerText(),/RELAY SECURED/);
 await page.screenshot({path:'artifacts/relay-run/victory.png'});
 const time=await page.evaluate(()=>window.game.run.time);
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>window.game.run.time),time);
 await page.getByRole('button',{name:'Retry mission'}).click();
 await page.waitForFunction(()=>window.game?.scene?.isReady()&&window.game.run.time>.2&&window.game.sortie.route.step===0,null,{timeout:180000});
 await page.evaluate(()=>{window.game.player.hp=0;});
 await page.waitForSelector('.relay-result');
 assert.match(await page.locator('.relay-result').innerText(),/MISSION FAILED/);
 assert.deepEqual(errors,[]);
 console.log('Relay browser checks passed: load, wall collision, open route, healing, approach, boss victory, frozen results, retry and death.');
} finally {await browser.close();}
