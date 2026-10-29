import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|compile|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  const {dorothyLanding}=await import('/src/survivor/dorothy/landing-effects.ts');
  dorothyLanding(g.vfx,g.player.position,4);g.vfx.update(.18);await g.vfx.prepare();g.scene.render();
  return {feathers:g.vfx.quads.filter(q=>q.busy&&q.motif==='feather').length,energy:g.vfx.quads.filter(q=>q.busy&&q.motif==='energy').length};
 });
 await page.screenshot({path:'artifacts/dorothy/landing-energy.png'});
 assert.equal(result.feathers,22);assert.equal(result.energy,1);
 await page.evaluate(()=>{game.vfx.update(.4);game.scene.render();});
 await page.screenshot({path:'artifacts/dorothy/landing-feathers.png'});
 const remaining=await page.evaluate(()=>{game.vfx.update(2);game.scene.render();return game.vfx.quads.filter(q=>q.busy&&q.motif).length;});
 assert.equal(remaining,0);assert.deepEqual(errors,[]);console.log({...result,remaining,errors});
}finally{await browser.close();}
