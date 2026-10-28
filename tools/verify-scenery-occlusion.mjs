import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/scenery-occlusion';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/?run=test-range&zone=sakura_day&time=day');
 await page.waitForFunction(()=>window.game?.sceneryOcclusion&&window.game.scene.isReady(),null,{timeout:180000});
 const report=await page.evaluate(()=>{
  const g=window.game;g.engine.stopRenderLoop();g.camera.update=()=>{};
  const mast=g.elevator.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast');
  const scale=mast.scaling.asArray();
  const check=(x,z)=>{
   g.player.position.set(x,0,z);const c=g.camera.camera;c.position.set(x,11,z-15);c.setTarget(g.player.position.add(c.position.clone().set(0,1,0)));c.getViewMatrix(true);
   const meshes=[...g.dressing.meshes,...g.elevator.root.getChildMeshes()];
   for(let i=0;i<45;i++)g.sceneryOcclusion.update(1/60,g.player.position,meshes);
   return meshes.filter(m=>m.visibility<.3).map(m=>({name:m.name,visibility:m.visibility,blend:m.material.needAlphaBlendingForMesh(m)}));
  };
  const gate=check(0,-20),tower=check(0,9);
  g.scene.render();return {scale,gate,tower};
 });
 assert.deepEqual(report.scale,[.5,.5,.5]);assert.ok(report.gate.length>0,'gate fades');assert.ok(report.tower.some(m=>m.name.includes('mast')),'mast fades');
 assert.ok(report.tower.every(m=>m.blend),'faded meshes actually use blending');
 await page.waitForFunction(()=>window.game.scene.isReady(),null,{timeout:60000});
 await page.evaluate(()=>window.game.scene.render());
 await page.screenshot({path:`${out}/tower-sakura.png`});
 const other=await page.evaluate(()=>{const g=window.game;g.setRangeEnvironment('outskirts');const m=g.elevator.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast');return m.scaling.asArray();});
 assert.deepEqual(other,[.5,.5,.5],'all maps retain the compact tower');
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/verification.json`,JSON.stringify({report,other,errors},null,2));console.log('Live scene: Sakura half-scale mast, gate/tower fades, real alpha blending, other-map size restoration, no browser errors.');
}finally{await browser.close();}
