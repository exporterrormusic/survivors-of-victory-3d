import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=rapunzel&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(()=>{
 const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();g.targets.navigation.setScenery([]);
 const p=g.player.position.clone().set(8,0,-8);g.player.ctx.teleport(p);g.camera.snap(p.add(p.clone().set(0,0,6)));g.run.critChance=0;
 for(const t of g.targets.targets){t.position.set(-20,0,20);t.hp=1000;t.alive=true;}
 const a=g.targets.targets[0],b=g.targets.targets[1],c=g.targets.targets[2];a.position.set(8,0,4);b.position.set(10.5,0,3.4);c.position.set(15,0,4);
 g.kit.fire(p.add(p.clone().set(0,.7,0)),a.position.add(p.clone().set(0,.7,0)));
 for(let i=0;i<12;i++){g.kit.update(1/60);g.vfx.update(1/60);}
 const rocket=g.scene.transformNodes.find(n=>n.name==='sw-missile'&&n.isEnabled());
 const distance=rocket.position.z+8;g.scene.render();
 return {distance,scale:rocket.scaling.x};
 });
 console.log(result);assert.ok(Math.abs(result.distance-3.6)<.01);assert.ok(result.scale>2.3);
 await page.screenshot({path:'artifacts/rapunzel/upgraded-rocket-trail.png'});
 const hit=await page.evaluate(()=>{for(let i=0;i<28;i++){game.kit.update(1/60);game.vfx.update(1/60);}game.scene.render();return game.targets.targets.slice(0,3).map(t=>t.hp);});
 console.log('splash HP',hit);assert.equal(hit[0],985);assert.equal(hit[1],985);assert.equal(hit[2],1000);
 await page.screenshot({path:'artifacts/rapunzel/upgraded-rocket-impact.png'});
 const cleanup=await page.evaluate(()=>{for(let i=0;i<120;i++){game.kit.update(1/60);game.vfx.update(1/60);}return game.scene.transformNodes.filter(n=>n.name==='sw-missile'&&n.isEnabled()).length;});assert.equal(cleanup,0);assert.deepEqual(errors,[]);
 console.log('PASS: 18 m/s flight, larger model, expanded splash, distant target untouched, rocket retirement, no browser errors.');
}finally{await browser.close();}
