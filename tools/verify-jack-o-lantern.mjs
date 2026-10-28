import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:5199/tools/review/forest-kit-review.html');
  await page.waitForFunction(()=>window.forestKit?.scene.isReady(),null,{timeout:120000});
  await page.evaluate(()=>forestKit.show('forest-jack-o-lantern'));
  await page.waitForFunction(()=>forestKit.scene.isReady());await page.waitForTimeout(800);
  await page.screenshot({path:'artifacts/jack-o-lantern-front.png'});
  const info=await page.evaluate(async()=>{
    const {Ray,Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const scene=forestKit.scene,shell=scene.getMeshByName('jack-o-lantern-carved-shell');shell.computeWorldMatrix(true);
    const hit=(x,y,length)=>new Ray(new Vector3(x,y,-1),new Vector3(0,0,1),length).intersectsMesh(shell).hit;
    return {triangles:shell.getTotalIndices()/3,meshes:scene.getTransformNodeByName('forest-jack-o-lantern').getChildMeshes().length,
      eyeOpen:!hit(-.22,.55,.85),backIntact:hit(-.22,.55,2),browIntact:hit(0,.6,.85),
      textures:scene.textures.every(t=>t.isReady())};
  });
  assert.ok(info.eyeOpen,'eye is an actual hole');assert.ok(info.backIntact,'carving preserves back wall');assert.ok(info.browIntact);assert.ok(info.textures);
  await page.evaluate(()=>{forestKit.camera.alpha=1;});await page.waitForTimeout(300);
  await page.screenshot({path:'artifacts/jack-o-lantern-back.png'});
  await page.evaluate(()=>{forestKit.camera.alpha=-Math.PI/2-.22;forestKit.scene.lights.forEach(l=>l.intensity*=.16);});await page.waitForTimeout(300);
  await page.screenshot({path:'artifacts/jack-o-lantern-night.png'});
  assert.deepEqual(errors,[]);console.log('Jack-o-lantern carving, textures and browser render passed:',info);
} finally {await browser.close();}
