import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
const base=process.env.SAKURA_KIT_URL??'http://127.0.0.1:5198';
const out='public/environment/sakura-kit-v1',art='artifacts/sakura-kit-v1';
await fs.mkdir(art,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],manifest={units:'metres',source:'src/survivor/sakura-kit.ts',texture:'material-atlas.png',assets:[]};
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${base}/tools/review/sakura-kit-review.html`);
  await page.waitForFunction(()=>window.sakuraKit?.scene.isReady(),null,{timeout:90000});
  assert.ok(await page.evaluate(()=>window.sakuraKit.scene.textures.filter(t=>t.url?.includes('material-atlas')).every(t=>t.isReady())), 'painted atlas loaded');
  await page.screenshot({path:`${art}/kit.png`});
  for(const asset of process.argv.includes('--capture-only')?[]:await page.evaluate(()=>window.sakuraKit.assets)){
    await page.evaluate(a=>window.sakuraKit.show(a),asset);
    await page.waitForFunction(()=>window.sakuraKit.scene.isReady());
    await page.screenshot({path:`${art}/${asset}.png`});
    const result=await page.evaluate(a=>window.sakuraKit.exportAsset(a),asset);
    const bytes=Buffer.from(result.base64,'base64'),validation=await validator.validateBytes(new Uint8Array(bytes));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok(json.meshes?.length>0&&json.images?.length>0&&json.buffers?.[0]?.byteLength>0,'GLB must contain geometry and embedded painted textures');
    assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
    await fs.writeFile(`${out}/${asset}.glb`,bytes);
    manifest.assets.push({id:asset,file:`${asset}.glb`,triangles:result.triangles,bytes:bytes.length,validationErrors:0});
    console.log(`${asset}: ${result.triangles} triangles; valid textured GLB`);
  }
  if(manifest.assets.length)await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
  await page.goto(`${base}/?run=test-range&zone=sakura_day&time=day`);
  await page.waitForFunction(()=>window.game?.dressing?.theme==='sakura'&&window.game.scene.isReady(),null,{timeout:180000});
  await page.evaluate(()=>{const g=window.game;g.player.position.set(0,0,-29);g.camera.setDistance(24);g.camera.snap(g.player.position);});
  await page.waitForTimeout(2000);
  await page.screenshot({path:`${art}/in-game-day.png`});
  console.log(await page.evaluate(()=>({theme:window.game.dressing.theme,meshes:window.game.dressing.meshes.length,atlasReady:window.game.scene.textures.some(t=>t.url?.includes('sakura-kit-v1/material-atlas')&&t.isReady())})));
  await fs.writeFile(`${art}/errors.json`,JSON.stringify(errors,null,2));
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
