import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
 await page.addInitScript(()=>{
   if(localStorage.getItem('survival-test-seeded'))return;
   localStorage.setItem('survival-test-seeded','yes');
   localStorage.setItem('nikke-moba.roster-v1',JSON.stringify({pristineCores:0,ownedSkinIds:[],unlockedCharacterIds:['snow-white']}));
   localStorage.setItem('nikke-moba.progress-v1',JSON.stringify({characters:{'snow-white':{level:19,xp:400,skillPoints:20,ranks:{attack:5,skill:5,burst:5}}}}));
 });
 await page.goto('http://127.0.0.1:5194/?run=test-range&mission=survival_round&zone=outskirts_day&enemies=inactive',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await fs.mkdir('artifacts/survival-round',{recursive:true});
 const fresh=await page.evaluate(()=>{
   const g=window.game;g.player.takeDamage=()=>false;
   return {phase:g.sortie.round.phase,level:g.run.level,sp:g.run.skillPoints,ranks:['attack','skill','burst'].map(k=>g.run.talents.abilityRank(k)),movement:g.targets.movementMode};
 });
 assert.equal(fresh.level,1);assert.equal(fresh.sp,0);assert.deepEqual(fresh.ranks,[1,1,1]);assert.equal(fresh.movement,'pursue');
 console.log('Fresh ranks and saved-profile isolation passed.');
 await page.screenshot({path:'artifacts/survival-round/arrival.png'});
 await page.evaluate(()=>{
   const g=window.game;
   g.elevator.update(6);g.sortie.update(.01);g.elevator.update(1.81);g.sortie.update(.01);
 });
 await page.waitForFunction(()=>window.game.sortie.round.phase==='survive',null,{timeout:180000});
 console.log('Elevator arrival released controls.');
 assert.equal(await page.evaluate(()=>window.game.player.transported),false);
 assert.equal(await page.evaluate(()=>window.game.elevator.state.gateOpen),1);
 await page.evaluate(()=>{for(let i=0;i<20;i++)window.game.sortie.update(.5);});
 await page.waitForFunction(()=>window.game.targets.targets.filter(t=>t.alive).length>=5,null,{timeout:120000});
 const xp=await page.evaluate(()=>{
   const g=window.game, before=g.run.xp;const t=g.targets.targets.find(t=>t.alive);g.run.damage(t,10000,'attack');
   const awarded=g.run.xp>before||g.run.level>1;g.run.gainXp(g.run.xpToNext);return awarded;
 });
 assert.ok(xp,'Kills award XP');
 await page.keyboard.press('Tab');await page.waitForSelector('#run-talents[open]');
 const paused=await page.evaluate(()=>window.game.sortie.round.elapsed);
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.game.sortie.round.elapsed),paused);
 await page.locator('.st-node[data-track="attack"][data-rank="4"]').click();
 assert.equal(await page.locator('.st-purchase').isDisabled(),true);
 await page.locator('.st-node[data-track="attack"][data-rank="2"]').click();
 await page.locator('.st-purchase').click();
 assert.equal(await page.evaluate(()=>window.game.run.talents.abilityRank('attack')),2);
 await page.screenshot({path:'artifacts/survival-round/talents.png'});
 await page.getByRole('button',{name:'Resume game',exact:true}).click();
 await page.evaluate(()=>{
   const g=window.game;g.run.burst=100;g.input.trigger('burst');
 });
 await page.waitForFunction(()=>window.game.run.burst<100);
 await page.evaluate(()=>{
   const g=window.game;g.sortie.placeMedical();g.player.hp=10;
   g.player.position.x=g.sortie.med.position.x;g.player.position.z=g.sortie.med.position.z;
 });
 await page.waitForFunction(()=>!window.game.sortie.medAvailable);
 assert.ok(await page.evaluate(()=>window.game.player.hp>10));
 console.log('Elevator, combat XP, paused ordered upgrades, Burst and healing passed.');
 await page.evaluate(()=>{const g=window.game;g.sortie.round.elapsed=299.95;});
 await page.waitForFunction(()=>window.game.targets.targets.some(t=>t.alive&&t.type.id==='mma001'),null,{timeout:120000});
 await page.screenshot({path:'artifacts/survival-round/heavy.png'});
 await page.evaluate(()=>{
   const g=window.game;g.run.gainXp(100000);
   for(const tree of ['attack','skill','burst'])for(let rank=g.run.talents.abilityRank(tree)+1;rank<=5;rank++)g.run.talents.purchase(tree,rank,g.run);
   g.sortie.round.elapsed=1199.95;
 });
 await page.waitForFunction(()=>window.game.sortie.round.phase==='boss'&&window.game.targets.targets.some(t=>t.alive&&t.type.id==='eca001'),null,{timeout:120000});
 assert.equal(await page.evaluate(()=>window.game.sortie.ended),false);
 await page.evaluate(()=>{window.game.sortie.barrageIn=.01;});
 await page.waitForFunction(()=>window.game.sortie.strikes.length>0);
 await page.screenshot({path:'artifacts/survival-round/boss.png'});
 await page.evaluate(()=>{const g=window.game;g.run.damage(g.targets.targets.find(t=>t.alive&&t.type.id==='eca001'),100000,'effect');});
 await page.waitForSelector('.survival-results');
 assert.match(await page.locator('.survival-results').innerText(),/ROUND COMPLETE/);
 assert.match(await page.locator('[data-reward]').innerText(),/1 Rapture Core · saved/);
 const wallet=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nikke-moba.roster-v1')).pristineCores);
 assert.equal(await wallet(),1);
 const frozen=await page.evaluate(()=>window.game.run.time);await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>window.game.run.time),frozen);assert.equal(await wallet(),1);
 await page.screenshot({path:'artifacts/survival-round/victory.png'});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nikke-moba.progress-v1')).characters['snow-white'].level),19,'Legacy saved ranks were not overwritten');
 const purchase=await page.evaluate(async()=>{
   const skins=await import('/src/frontend/profile/Skins.ts');const roster=await import('/src/frontend/profile/CharacterRoster.ts');
   const skin=skins.characterSkins('snow-white').find(s=>s.cost>0);
   if(!skin)throw Error('No Snow White skin to purchase');
   return {cost:skin.cost,bought:skins.purchaseSkin(skin.id),owned:skins.ownsSkin(skin),balance:roster.loadRosterState().pristineCores,receipts:roster.loadRosterState().roundCoreReceipts.length};
 });
 assert.deepEqual(purchase,{cost:1,bought:true,owned:true,balance:0,receipts:1});
 console.log('Final boss gate, telegraph, one-time core reward and permanent skin purchase passed.');
 await page.getByRole('button',{name:'New round',exact:true}).click();
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{const g=window.game;g.elevator.update(6);g.sortie.update(.01);g.elevator.update(1.81);g.sortie.update(.01);});
 await page.waitForFunction(()=>window.game.sortie.round.phase==='survive');
 assert.deepEqual(await page.evaluate(()=>['attack','skill','burst'].map(k=>window.game.run.talents.abilityRank(k))),[1,1,1]);
 assert.equal(await page.evaluate(()=>window.game.run.level),1);assert.equal(await wallet(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nikke-moba.roster-v1')).ownedSkinIds.length),1);
 await page.evaluate(()=>{window.game.player.hp=0;});await page.waitForSelector('.survival-results');
 assert.match(await page.locator('[data-reward]').innerText(),/No core earned/);assert.equal(await wallet(),0);
 assert.deepEqual(errors,[]);
 console.log('Survival browser checks passed: fresh retry, retained skin, death without reward; no page errors.');
}finally{await browser.close();}
