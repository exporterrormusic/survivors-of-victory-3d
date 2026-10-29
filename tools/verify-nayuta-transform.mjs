import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.NAYUTA_TEST_URL ?? 'http://127.0.0.1:5197'}/?run=test-range&character=nayuta&enemies=inactive`);
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{game.engine.setHardwareScalingLevel(2);game.run.burstAlwaysMax=false;game.run.burst=100;for(const t of game.targets.targets)t.alive=false;});
 const before=await page.evaluate(()=>({skin:game.player.chibi.meta.variant,saved:JSON.stringify(localStorage)}));
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>game.kit.burstActive&&game.kit.burstActionReady);
 const form=await page.evaluate(()=>{const f=game.player.chibi.root;return{active:game.kit.burstActive,visible:f.isEnabled(),lift:f.position.y,baseVisible:game.player.chibi.root.isEnabled(),label:game.kit.burstLabel,gauge:game.run.burst};});
 console.log({before,form});assert.equal(before.skin,'c223_00');assert.ok(form.active&&form.visible&&form.baseVisible);assert.ok(form.lift>.5);assert.match(form.label,/1\/3/);assert.equal(form.gauge,0);
 console.log('capture form');await page.screenshot({path:'artifacts/nayuta/wu-wei-burst-form.png'});console.log('form captured');
 await page.mouse.click(710,310);assert.match(await page.evaluate(()=>game.kit.burstLabel),/1\/3/);
 for(let i=1;i<=3;i++){
  await page.waitForFunction(()=>game.kit.burstActionReady);
  console.log('punch',i);await page.keyboard.press('KeyE');
  await page.waitForFunction(n=>game.kit.burstLabel===(n===3?'FINAL PALM':`E - PUNCH ${n+1}/3`),i);
  if(i===3){await page.screenshot({path:'artifacts/nayuta/massive-third-palm.png'});await page.keyboard.press('KeyE');}
 }
 await page.waitForFunction(()=>!game.kit.burstActive);
 const restored=await page.evaluate(()=>({base:game.player.chibi.root.isEnabled(),form:game.kit.burstActive,lift:game.player.chibi.root.position.y,gauge:game.run.burst,saved:JSON.stringify(localStorage)}));
 assert.ok(restored.base&&!restored.form);assert.equal(restored.lift,0);assert.equal(restored.gauge,0);assert.equal(restored.saved,before.saved);
 const placements=[];
 for(const width of [1440,768]){
  await page.setViewportSize({width,height:900});
  const placement=await page.evaluate(()=>{const a=document.querySelector('.run-kit-status').getBoundingClientRect(),b=document.querySelector('[data-slot="special"]').getBoundingClientRect();return{top:a.top,bottom:a.bottom,cardTop:b.top,center:a.x+a.width/2,cardCenter:b.x+b.width/2,left:a.left,right:a.right};});
  placements.push({width,...placement});assert.ok(placement.bottom<placement.cardTop);assert.ok(Math.abs(placement.center-placement.cardCenter)<1);assert.ok(placement.left>=0&&placement.right<=width);
  await page.screenshot({path:`artifacts/nayuta/clone-indicator-${width}.png`});
 }
 assert.deepEqual(errors,[]);console.log({restored,placements});await writeFile('artifacts/nayuta/transform-results.json',JSON.stringify({before,form,restored,placements,errors},null,2));
 console.log('PASS: real E input, same equipped model, floating/gold shader, LMB suppression, three punches, gauge, restoration and HUD placement.');
}finally{await browser.close();}
