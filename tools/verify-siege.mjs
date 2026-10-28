import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5195/?prototype=ark-siege',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.siege?.scene.isReady(),null,{timeout:90000});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{window.siege.sim.paused=true;});
 await fs.mkdir('artifacts/ark-siege',{recursive:true});
 await settle();await page.screenshot({path:'artifacts/ark-siege/01-overview.png'});
 await page.click('#view');
 await page.evaluate(()=>{window.siege.sim.paused=false;});
 const before=await page.evaluate(()=>window.siege.sim.player.x);
 await page.keyboard.down('KeyD');await page.waitForTimeout(700);await page.keyboard.up('KeyD');
 const after=await page.evaluate(()=>window.siege.sim.player.x);assert(after>before+2,'WASD moves player toward lanes');
 // Verify actual pointer aiming and damage, not just the simulation fire method.
 await page.evaluate(()=>{const g=window.siege;g.setPlayer({x:-15,z:0});g.sim.nextWave=g.sim.nextAllies=Infinity;g.sim.units=[{id:999,side:'enemy',lane:1,x:-5,z:0,hp:200,maxHp:200,progress:191,cooldown:100,heavy:false}];});
 await settle();
 const target=await page.evaluate(()=>window.siege.screenPoint({x:-5,z:0}));
 await page.mouse.move(target.x,target.y);await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();
 assert(await page.evaluate(()=>window.siege.sim.units.find(u=>u.id===999)?.hp<200),'pointer firing damages target');
 await page.locator('summary').click();await page.click('#breach');
 assert.deepEqual(await page.evaluate(()=>[0,1,2].map(i=>window.siege.sim.front(i))),[-90,0,0]);
 await page.evaluate(()=>{const s=window.siege; s.setPlayer({x:-45,z:72});s.sim.objectives.find(o=>o.id==='rescue-gate-0').guards=0;});
 await page.keyboard.press('KeyE');assert.equal(await page.evaluate(()=>window.siege.sim.objectives.find(o=>o.id==='rescue-gate-0').state),'escorting');
 await settle();await page.screenshot({path:'artifacts/ark-siege/02-breach-escort.png'});
 await page.click('#view');await page.selectOption('#surface','snow');
 await settle();await page.screenshot({path:'artifacts/ark-siege/03-snow-layout.png'});
 await page.setViewportSize({width:1280,height:720});
 await settle();await page.screenshot({path:'artifacts/ark-siege/04-small-screen.png'});
 assert.deepEqual(errors,[]);console.log('PASS: browser load, movement, camera toggle, breach, rescue interaction, surface switch, responsive capture; no page errors.');
}finally{await browser.close();}
