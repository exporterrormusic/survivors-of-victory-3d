import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:5199/tools/review/forest-kit-review.html');
  await page.waitForFunction(()=>window.forestKit?.scene.isReady(),null,{timeout:120000});
  await page.evaluate(()=>forestKit.show('forest-vapaus-vial'));
  await page.waitForFunction(()=>forestKit.scene.isReady());await page.waitForTimeout(500);
  await page.screenshot({path:'artifacts/vapaus-vial-front.png'});
  const info=await page.evaluate(()=>{
    const scene=forestKit.scene,root=scene.getTransformNodeByName('forest-vapaus-vial'),bounds=root.getHierarchyBoundingVectors(true);
    const blood=scene.getMaterialByName('vapaus-blood'),glass=scene.getMaterialByName('vapaus-clear-glass');
    return {name:root.metadata.displayName,height:bounds.max.y-bounds.min.y,red:blood.diffuseColor.r,
      green:blood.diffuseColor.g,emission:blood.emissiveColor.asArray(),glassAlpha:glass.alpha,textures:scene.textures.every(t=>t.isReady()),
      triangles:root.getChildMeshes().reduce((n,m)=>n+m.getTotalIndices()/3,0)};
  });
  assert.equal(info.name,'Vapaus vial');assert.ok(info.height>.13&&info.height<.15);assert.ok(info.red>info.green*5);
  assert.deepEqual(info.emission,[0,0,0]);assert.ok(info.glassAlpha<.5&&info.glassAlpha>0);assert.ok(info.textures);
  await page.evaluate(()=>{forestKit.camera.alpha=1.1;});await page.waitForTimeout(250);
  await page.screenshot({path:'artifacts/vapaus-vial-back.png'});
  assert.deepEqual(errors,[]);console.log('Vapaus vial render/material checks passed:',info);
}finally{await browser.close();}
