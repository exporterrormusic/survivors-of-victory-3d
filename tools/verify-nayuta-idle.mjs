import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(()=>{
  const g=game;g.engine.stopRenderLoop();
  const playerQuiet=g.player.chibi.animationGroup('idle')===g.player.chibi.animationGroup('talk_idle');
  g.kit.useSpecial();g.kit.chargeSpecial(0,false,true);const clone=g.targets.squad.find(c=>c.name==='Nayuta (Clone)');
  const cloneQuiet=clone.model.animationGroup('idle')===clone.model.animationGroup('talk_idle');
  const quiet=g.player.chibi.animationGroup('idle'),flourish=g.player.chibi.animationGroup('idle_eff');
  const scales=quiet.targetedAnimations.filter(a=>a.target.name==='B_acc_cap_01'&&a.animation.targetProperty==='scaling').flatMap(a=>a.animation.getKeys().map(k=>Math.max(k.value.x,k.value.y,k.value.z)));
  return {playerQuiet,cloneQuiet,flourishPreserved:quiet!==flourish&&!!flourish,maximumHatScale:Math.max(...scales)};
 });
 console.log(result);assert.ok(result.playerQuiet&&result.cloneQuiet&&result.flourishPreserved);assert.ok(result.maximumHatScale<.02);
 console.log('PASS: player and clone idle use the quiet clip, hat remains retracted, authored flourish is retained.');
}finally{await browser.close();}
