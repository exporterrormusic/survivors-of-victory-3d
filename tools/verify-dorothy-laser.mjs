import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error' && /shader|compile|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
   const g=game;g.engine.setHardwareScalingLevel(2);g.engine.stopRenderLoop();
   g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
   const V=g.player.position.constructor;
   for(const t of g.targets.targets)t.alive=false;
   const t=g.targets.targets[0];t.alive=true;t.hp=100;t.position.set(0,0,5);t.ward=null;t.marks.clear();t.breaks.clear();
   Object.defineProperty(t,'radius',{value:.18});g.run.critChance=0;
   const trace=g.targets.navigation.traceCover,shield=g.targets.shieldContact;
   g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;
   g.kit.fire(new V(0,1.8,0),new V(0,1.8,10));
   for(let i=0;i<80;i++){g.kit.update(.01);g.vfx.update(.01);}
   const smallDamage=100-t.hp;
   t.hp=100;g.targets.navigation.traceCover=()=>0;
   g.kit.fire(new V(0,1.8,0),new V(0,1.8,10));
   g.kit.update(.2);g.vfx.update(.3);const blockedDamage=100-t.hp;
   g.targets.navigation.traceCover=trace;g.targets.shieldContact=shield;
   for(const target of g.targets.targets)target.alive=false;
   // Visible paused firing sample. No fake graphics: use the actual weapon and shader.
   const origin=g.player.position.add(new V(0,1.4,0));
   g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;
   for(let i=0;i<3;i++){g.kit.fire(origin,origin.add(new V(8,0,12)));g.kit.update(.085);g.vfx.update(.085);}
   await g.vfx.prepare();g.scene.render();
   const beams=g.vfx.quads.filter(q=>q.busy&&q.laser);
   return {smallDamage,blockedDamage,beams:beams.length,widths:beams.map(q=>q.scaling.y),materialReady:g.scene.getMeshByName('fx-quads').material.isReady(g.scene.getMeshByName('fx-quads'))};
 });
 assert.equal(result.smallDamage,3);assert.equal(result.blockedDamage,0);assert.equal(result.beams,3);assert.ok(result.widths.every(w=>w===.72));assert.ok(result.materialReady);
 await page.screenshot({path:'artifacts/dorothy/laser-shader.png',timeout:20000});
 const cleanup=await page.evaluate(()=>{game.kit.dispose();game.vfx.update(1);return game.vfx.quads.filter(q=>q.busy&&q.laser).length;});
 assert.equal(cleanup,0);assert.deepEqual(errors,[]);
 await writeFile('artifacts/dorothy/laser-verification.json',JSON.stringify({...result,cleanup,errors},null,2));
 console.log({...result,cleanup,errors});
}finally{await browser.close();}
