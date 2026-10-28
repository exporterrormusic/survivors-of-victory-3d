import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/frozen-layout';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 if(process.env.FROZEN_PATCH_STORM)await page.route('**/src/survivor/storm-kit.ts*',async route=>{const r=await route.fetch();route.fulfill({response:r,body:(await r.text()).replace('this.panel.map(','(this.panel??[0,0,1]).map(')});});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`${process.env.FROZEN_REVIEW_URL??'http://127.0.0.1:5198'}/?run=test-range&zone=snow_day&time=day`);
 await page.waitForFunction(()=>window.game?.dressing?.theme==='frozen'&&window.game.scene.isReady(),null,{timeout:180000});
 const report=await page.evaluate(()=>{
  const g=window.game;g.snow.update(1);g.engine.stopRenderLoop();g.camera.update=()=>{};
  const mast=g.elevator.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast');
  const bounds=g.snow.mesh.getBoundingInfo().boundingBox;
  return {radius:g.targets.navigation.extent,snowEnabled:g.snow.enabled,edgeDepth:g.snow.field.depth(53,0),snowWidth:g.snow.field.bounds.width,ridgeDepth:g.snow.field.depth(28,-16),vertices:g.snow.mesh.getTotalVertices(),min:bounds.minimum.asArray(),max:bounds.maximum.asArray(),towerScale:mast.scaling.asArray(),dressingMeshes:g.dressing.meshes.length};
 });
 assert.ok(report.snowEnabled&&report.edgeDepth>.08);assert.ok(report.min[0]<-149&&report.max[0]>149);assert.deepEqual(report.towerScale,[.5,.5,.5]);
 assert.equal(report.radius,54);assert.equal(report.snowWidth,152);assert.ok(report.ridgeDepth>.6);
 await page.addStyleTag({content:'body * {visibility:hidden !important} canvas {visibility:visible !important}'});
 for(const shot of [
  {name:'overview',eye:[0,150,-60],target:[0,0,3]},
  {name:'gameplay-lift',eye:[0,20,-16],target:[0,0,4]},
  {name:'north',eye:[0,18,2],target:[0,0,22]},
  {name:'edge',eye:[20,16,-14],target:[34,1,-30]},
 ].filter(shot=>!process.env.FROZEN_QUICK||['overview','north'].includes(shot.name))){
  await page.evaluate(({eye,target,name})=>{const g=window.game,c=g.camera.camera;g.scene.fogEnabled=name!=='overview';c.position.set(...eye);c.setTarget(c.position.clone().set(...target));c.getViewMatrix(true);g.scene.render();},shot);
  await page.waitForFunction(()=>window.game.scene.isReady(),null,{timeout:60000});
  await page.evaluate(()=>window.game.scene.render());
  await page.screenshot({path:`${out}/${shot.name}.png`});
 }
 const sizes=await page.evaluate((quick)=>{
  const g=window.game,result={};for(const theme of (quick?[]:['sakura','outskirts','city','forest','storm','plain'])){g.setRangeEnvironment(theme);result[theme]=g.elevator.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast').scaling.asArray();}return result;
 },Boolean(process.env.FROZEN_QUICK));
 for(const size of Object.values(sizes))assert.deepEqual(size,[.5,.5,.5]);
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/verification.json`,JSON.stringify({report,sizes,errors},null,2));
 console.log('Frozen live scene: full-ground snow, forest boundary, compact towers on every theme; no browser errors.');
}finally{await browser.close();}
