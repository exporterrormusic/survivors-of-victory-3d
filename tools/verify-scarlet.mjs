import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5196/?run=test-range&enemies=inactive',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.locator('#weather-lab > summary').click();
 await page.selectOption('#lab-character','scarlet');
 await page.waitForFunction(()=>window.game?.run?.characterId==='scarlet' && window.game.scene.isReady(),null,{timeout:180000});
 assert.equal(await page.evaluate(()=>game.kit.weapon.melee),true);
 const result=await page.evaluate(()=>{
   const g=game;g.scene.onBeforeRenderObservable.clear();g.scene.onAfterAnimationsObservable.clear();
   g.player.position.set(0,0,-8);g.player.unstick();g.camera.snap(g.player.position);
   // Kit context owns a shared position updated by the main loop; move it with teleport.
   g.player.ctx.teleport(g.player.position);
   g.player.aim.set(0,0,10);g.run.critChance=0;
   const t=g.targets.targets[0]; t.position.set(0,0,-5.5);t.hp=60;t.alive=true;
   for(let i=1;i<g.targets.targets.length;i++)g.targets.targets[i].position.set(20+i,0,20);
   g.kit.fire(g.player.position,g.player.aim);
   const hitHp=t.hp, firstCost=g.player.hp;
   for(let i=0;i<40;i++)g.kit.fire(g.player.position,g.player.aim);
   const floor=g.player.hp;
   g.player.hp=10;g.kit.fire(g.player.position,g.player.aim);const low=g.player.hp;
   for(const track of ['attack','skill','burst'])for(let rank=2;rank<=5;rank++)g.run.talents.purchase(track,rank,g.run);
   t.hp=60;t.alive=true;t.position.set(0,0,-3);
   g.kit.chargeSpecial(2,true,false);g.kit.chargeSpecial(0,false,true);
   g.kit.update(.1);const waveReady=g.kit.special().charges;g.kit.useSpecial();
   const teleported=g.player.position.z;
   g.player.hp=49;g.scene.render();g.kit.useBurst(g.player.position,0);const burstHp=g.player.hp;
   for(let i=0;i<100;i++)g.kit.update(.1);
   return {hitHp,firstCost,floor,low,waveReady,teleported,burstHp,sp:g.run.skillPoints,busy:g.kit.busy};
 });
 console.log(result);
 assert.equal(result.hitHp,50);assert.equal(result.firstCost,49);assert.equal(result.floor,25);assert.equal(result.low,10);
 assert.equal(result.sp,0);assert.equal(result.waveReady,1);assert.ok(result.teleported>-8);assert.equal(result.burstHp,25);assert.equal(result.busy,false);
 assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts/scarlet',{recursive:true});
 await page.screenshot({path:'artifacts/scarlet/combat.png'});
 console.log('PASS: character switch, sword damage, HP floor, all ordered purchases, charged wave recast, teleport and Burst cost; no page errors.');
} finally { await browser.close(); }
