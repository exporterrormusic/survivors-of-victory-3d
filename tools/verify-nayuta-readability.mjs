import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5206/?run=test-range&character=nayuta&enemies=inactive');await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:240000});
 const states=await page.evaluate(()=>{
  const g=game,k=g.kit;window.drawReview=()=>{g.scene.render();g.hud.update(g.player,g.run,g.targets,g.toScreen,g.input.pointer);};g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();for(const t of g.targets.targets)t.alive=false;
  const tap=()=>{k.useSpecial();k.chargeSpecial(0,false,true);};const advance=t=>{for(let a=0;a<t;a+=.05){k.update(.05);g.vfx.update(.05);}};
  tap();g.targets.squad.find(c=>c.cloneDisplay).experience=12;k.useSpecial();k.chargeSpecial(.36,true,false);k.chargeSpecial(0,false,true);advance(1.4);
  advance(6);tap();tap();tap();
  const clones=g.targets.squad.filter(c=>c.cloneDisplay);clones.forEach((c,i)=>{c.experience=[0,6,12][i];c.position.copyFrom(g.player.position).addInPlaceFromFloats((i-1)*3,0,3);});
  k.setMeditating(true);k.update(.5);g.vfx.update(.5);window.drawReview();
  return clones.map(c=>c.cloneDisplay);
 });
 assert.equal(states.length,3);assert.equal(states[0].ready,false);assert.ok(states[1].progress>.49&&states[1].progress<.51);assert.equal(states[2].ready,true);
 const panel=page.locator('.nayuta-insight');await panel.waitFor();assert.match(await panel.getAttribute('aria-label'),/Meditating; timer paused/);assert.match(await panel.getAttribute('aria-label'),/1 mature/);assert.equal(await panel.locator('.ni-pips i').count(),4);assert.ok((await panel.innerText()).length<20);
 await page.screenshot({path:'artifacts/nayuta/maturity-insight-desktop.png'});
 const target=await page.evaluate(()=>{game.kit.useSpecial();window.drawReview();return game.targets.squad.filter(c=>c.cloneDisplay?.retrieving).length;});assert.equal(target,1);
 await page.setViewportSize({width:768,height:900});await page.evaluate(()=>window.drawReview());
 const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=768);await page.screenshot({path:'artifacts/nayuta/maturity-insight-compact.png'});
 const combat=await page.evaluate(async()=>{
  const g=game,{Horde}=await import('/src/survivor/mode/horde.ts');
  const clone=g.targets.squad.find(c=>c.cloneDisplay),target={position:clone.position.clone(),victim:null,alive:true,scale:1,stunned:0,radius:.4};
  const context={ctx:{player:g.player,field:g.targets}};
  Horde.prototype.pickVictim.call(context,target);
  const picked=target.victim===clone,health=clone.hp;
  Horde.prototype.touch.call(context,target,{touchIn:0,touch:6},.1);
  const damage=health-clone.hp;Horde.prototype.touch.call(context,target,{touchIn:0,touch:6},.1);
  const dead=!clone.alive;g.kit.update(.01);
  return{picked,health,damage,dead,removed:!g.targets.squad.includes(clone)};
 });
 assert.ok(combat.picked);assert.equal(combat.health,10);assert.equal(combat.damage,6);assert.ok(combat.dead&&combat.removed);console.log('Fragile clone targeting/contact damage:',combat);
 assert.deepEqual(errors,[]);console.log('PASS: immature/partial/mature labels, retrieval target, paused Insight panel, desktop and compact bounds.');
}finally{await browser.close();}
