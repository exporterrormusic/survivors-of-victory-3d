import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://localhost:5198/?run=test-range&environment=outskirts&enemies=inactive');
await page.waitForFunction(()=>window.game?.scene,null,{timeout:180000});console.log('game initialized');
console.log('select outskirts');await page.evaluate(()=>game.setRangeEnvironment('outskirts'));
await page.waitForFunction(()=>game.scene.meshes.some(m=>m.metadata?.outskirtsGrass)&&game.scene.isReady(),null,{timeout:180000});
await page.evaluate(()=>{game.player.position.set(16,0,15);game.camera.snap(game.player.position);});
await page.waitForTimeout(2000);
const info=await page.evaluate(()=>{const meshes=game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass);return {chunks:meshes.length,blades:meshes.reduce((n,m)=>n+m.thinInstanceCount,0),ready:meshes.every(m=>m.isReady(true))};});
await page.screenshot({path:'artifacts/outskirts-grass.png'});
assert.ok(info.blades>50000);assert.ok(info.ready);
assert.deepEqual(errors,[]);console.log(info);
await page.evaluate(()=>game.setRangeEnvironment('plain'));
assert.equal(await page.evaluate(()=>game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass).length),0);
console.log('select outskirts');await page.evaluate(()=>game.setRangeEnvironment('outskirts'));
assert.equal(await page.evaluate(()=>game.scene.meshes.filter(m=>m.metadata?.outskirtsGrass).length),info.chunks);
console.log('Shader compilation, instance count, map switching and disposal passed.');
} finally {await browser.close();}


