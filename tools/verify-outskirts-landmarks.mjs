import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text());}});
await page.goto('http://localhost:5198/?run=test-range&environment=outskirts&enemies=inactive');
await page.waitForFunction(()=>window.game?.scene,null,{timeout:180000});console.log('game initialized');
console.log('select outskirts');await page.evaluate(()=>game.setRangeEnvironment('outskirts'));
await page.waitForFunction(()=>game.scene.meshes.some(m=>m.metadata?.outskirtsGrass)&&game.scene.isReady(),null,{timeout:180000});
await page.evaluate(()=>{game.player.position.set(29,0,-42);game.camera.setDistance(28);game.camera.snap(game.player.position);});
await page.waitForTimeout(2000);
assert.ok(await page.evaluate(()=>{
const m=game.scene.getMeshByName('outskirts-impact-crater');
const normals=m.getVerticesData('normal');
return normals.filter((_,i)=>i%3===1).some(y=>y>.9)&&m.material===game.scene.getMaterialByName('range-ground-mat');
}),'upward-facing bowl shares terrain shader');
const info=await page.evaluate(()=>{const meshes=game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass);return {chunks:meshes.length,blades:meshes.reduce((n,m)=>n+m.thinInstanceCount,0),ready:meshes.every(m=>m.isReady(true))};});
await page.screenshot({path:'artifacts/outskirts-crater.png'});
assert.ok(await page.evaluate(()=>game.scene.getMeshByName('outskirts-impact-crater') && game.scene.particleSystems.some(p=>p.name==='outskirts-crater-smoke')));assert.ok(await page.evaluate(()=>{
const m=game.scene.getMeshByName('range-ground-crater'),p=m.getVerticesData('position');
return m.getIndices().every(i=>Math.abs(p[i*3+1])<.001);
}),'ground cut has no retained cap or walls');assert.ok(info.blades>50000);assert.ok(info.ready);
assert.deepEqual(errors,[]);console.log(info);
await page.evaluate(()=>{game.player.hp=50;game.player.position.set(29,0,-29);game.player.unstick();});
await page.waitForTimeout(1200);
const hazard=await page.evaluate(()=>({hp:game.player.hp,y:game.player.position.y,clear:game.targets.navigation.clear({x:29,z:-29},{x:29,z:-29},.45)}));
assert.ok(hazard.y < -1,'player descends onto crater slope');assert.ok(hazard.hp<50,'fire damages player');assert.ok(hazard.clear,'outer crater remains walkable');
assert.equal(await page.evaluate(()=>game.targets.navigation.clear({x:43,z:-43},{x:43,z:-43},.45)),false,'central fire blocks entry');
console.log('Crater walking and fire damage:',hazard);
const descent=await page.evaluate(()=>{
  const g=game,start=g.player.position.y;
  const input={move:()=>[Math.SQRT1_2,-Math.SQRT1_2],wasPressed:()=>false,wasReleased:()=>false,isHeld:()=>false};
  for(let i=0;i<20;i++)g.player.update(.05,input,g.player.aim);
  g.camera.snap(g.player.position);
  return {start,end:g.player.position.y,model:g.player.chibi.root.parent.position.y,camera:g.camera.focus.y};
});
assert.ok(descent.end<descent.start-2,'walking deeper lowers player');
assert.equal(descent.model,descent.end,'rendered character follows terrain');
assert.ok(Math.abs(descent.camera-descent.end)<.001,'camera follows terrain');
console.log('Actual movement descent:',descent);

await page.evaluate(()=>{game.player.position.set(20,0,-12);game.player.unstick();});
const safeHp=await page.evaluate(()=>game.player.hp);await page.waitForTimeout(500);
assert.equal(await page.evaluate(()=>game.player.hp),safeHp,'fire stops on exit');
await page.evaluate(()=>game.setRangeEnvironment('plain'));
assert.equal(await page.evaluate(()=>game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass).length),0);
console.log('select outskirts');await page.evaluate(()=>game.setRangeEnvironment('outskirts'));
assert.equal(await page.evaluate(()=>game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass).length),info.chunks);
console.log('Shader compilation, instance count, map switching and disposal passed.');
} finally {await browser.close();}





