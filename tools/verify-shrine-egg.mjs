// Sakura Grove shrine easter egg: walk the steps, capture each cutscene shot and the drunk Raptures.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const base=process.env.URL??'http://localhost:5173',out=process.env.OUT??'artifacts/shrine-egg';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?run=test-range&environment=sakura`);
 await page.waitForFunction(()=>window.game?.shrineEgg?.active&&window.game.scene.isReady(),null,{timeout:240000});
 const wait=ms=>page.waitForTimeout(ms);
 const state=()=>page.evaluate(()=>{const e=window.game.shrineEgg;return {step:e.step,icon:document.querySelector('.egg-radar-icon')?.src.slice(0,40)??null};});
 const go=()=>page.evaluate(()=>{const g=window.game,o=g.shrineEgg.objective;g.player.position.set(o.x,0,o.z);g.player.unstick();});
 const walkTo=(x,z)=>page.evaluate(([x,z])=>{const g=window.game;g.player.position.set(x,0,z);g.player.unstick();},[x,z]);
 await go();await wait(800);await page.screenshot({timeout:120000,path:`${out}/1-cup.png`});
 const cup=await page.evaluate(()=>{const e=window.game.shrineEgg;return {x:e.cupAt.x,z:e.cupAt.z};});
 await go();await wait(500);console.log('after cup',await state());
 await go();await wait(800);await page.screenshot({timeout:120000,path:`${out}/2-flask.png`});
 const flask=await page.evaluate(()=>{const e=window.game.shrineEgg;return {x:e.flaskAt.x,z:e.flaskAt.z};});
 await walkTo(flask.x,flask.z-.6);await wait(500);console.log('after flask',await state(),'flask r',Math.hypot(flask.x,flask.z).toFixed(1));
 // Raptures on the court, chasing.
 await page.evaluate(()=>window.game.targets.setMovement?.('pursue'));
 await go();await wait(400);console.log('at shrine',await state());
 for(const [t,n] of [[4,'a-arrival'],[6.9,'b-offering'],[9.9,'c-doors'],[12.2,'d1-walk'],[12.6,'d-emerge'],[15.8,'e-line'],[19.2,'f-bless']]){
  await page.waitForFunction(t=>window.game.shrineEgg.cut>=t||window.game.shrineEgg.step!=='cutscene',t,{timeout:120000});
  await page.screenshot({timeout:120000,path:`${out}/3${n}.png`});
 }
 await page.waitForFunction(()=>window.game.shrineEgg.step==='blessing',null,{timeout:120000});
 await wait(2500);
 const drunk=await page.evaluate(()=>window.game.targets.targets.filter(t=>t.alive).map(t=>+t.drunk.toFixed(1)));
 console.log('blessing',await state(),'drunk',drunk);
 await page.evaluate(()=>{const g=window.game,t=g.targets.targets.find(t=>t.alive);if(t){g.player.position.set(t.position.x,0,t.position.z-6);g.player.unstick();}});
 await wait(1200);await page.screenshot({timeout:120000,path:`${out}/4-drunk.png`});
 console.log('doors',await page.evaluate(()=>window.game.scene.transformNodes.filter(n=>/\.shrine-door-/.test(n.name)&&n.isEnabled()).map(n=>[n.name,+n.position.x.toFixed(2)])));
}finally{console.log('errors',errors.slice(0,8));await browser.close();}
