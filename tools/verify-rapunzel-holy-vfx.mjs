import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5197/?run=test-range&character=rapunzel&enemies=inactive');await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
await page.evaluate(()=>{const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();g.player.ctx.teleport(g.player.position.clone().set(8,0,-8));g.camera.snap(g.player.position);g.targets.navigation.setScenery([]);for(const t of g.targets.targets)t.position.set(-20,0,20);});
const edges=await page.evaluate(()=>['holy-seal','holy-halo','holy-shard'].map(name=>{const c=game.vfx.textures.get(name).getContext(),w=c.canvas.width,h=c.canvas.height,d=c.getImageData(0,0,w,h).data;let edge=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<6||y<6||x>=w-6||y>=h-6)edge=Math.max(edge,d[(y*w+x)*4+3]);return {name,edge};}));assert.ok(edges.every(e=>e.edge===0));
await page.evaluate(()=>{game.kit.useSpecial();game.kit.update(.4);game.vfx.update(.4);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-special.png'});
await page.evaluate(()=>{game.kit.useBurst(game.player.position,0);game.vfx.update(.25);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-burst.png'});
await page.evaluate(async()=>{game.kit.update(12);game.vfx.update(12);const fx=await import('/src/survivor/rapunzel/rocket-effects.ts');const p=game.player.position.add(game.player.position.clone().set(0,1,0)),trail=fx.rocketTrail(game.vfx,p);for(let i=1;i<=15;i++){trail.move(p.add(p.clone().set(0,0,i*.3)));game.vfx.update(1/60);}window.trail=trail;game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-projectile.png'});
await page.evaluate(async()=>{window.trail.stop();game.vfx.update(2);const fx=await import('/src/survivor/rapunzel/rocket-effects.ts');fx.holyGraceImpact(game.vfx,game.player.position.add(game.player.position.clone().set(0,0,3)));game.vfx.update(.16);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-impact.png'});
const cleanup=await page.evaluate(()=>{game.vfx.update(3);return game.vfx.quads.filter(q=>q.busy).length;});assert.equal(cleanup,0);
await page.evaluate(async()=>{const fx=await import('/src/survivor/rapunzel/rocket-effects.ts');window.fireAlive=true;fx.goldenFireField(game.vfx,()=>game.player.position.add(game.player.position.clone().set(3,0,3)),()=>2.875,()=>window.fireAlive);game.vfx.update(.6);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-burning-desire.png'});
await page.evaluate(()=>{window.fireAlive=false;game.vfx.update(.1);});
assert.equal(await page.evaluate(()=>game.scene.meshes.filter(m=>m.name==='rapunzel-golden-fire'&&m.isEnabled()).length),0,'Expired fire meshes return to their disabled pool');
await page.evaluate(()=>{for(const track of ['attack','skill','burst'])for(let r=2;r<=5;r++)game.run.talents.purchase(track,r,game.run);game.kit.useBurst(game.player.position,0,1);game.kit.update(.15);game.vfx.update(.15);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-barrage.png'});
await page.evaluate(()=>{game.vfx.update(2.1);game.scene.render();});await page.screenshot({path:'artifacts/rapunzel/holy-gates.png'});
const anchored = await page.evaluate(()=>{
 const gates=game.vfx.quads.filter(q=>q.busy&&q.texture==='glow'&&q.position.y>=2);
 const before=gates.map(q=>q.position.clone());
 game.player.ctx.teleport(game.player.position.add(game.player.position.clone().set(4,0,2)));
 game.kit.update(.2);game.vfx.update(.2);
 return {count:gates.length,fixed:gates.every((q,i)=>q.position.equalsWithEpsilon(before[i],.0001))};
});assert.equal(anchored.count,10);assert.ok(anchored.fixed,'All gates stay at their spawn point when Rapunzel moves and fires');
assert.deepEqual(errors,[]);console.log('PASS: transparent padded borders, Special/Burst/halo/impact/barrage renders, pooled effect cleanup, no browser errors.');
}finally{await browser.close();}
