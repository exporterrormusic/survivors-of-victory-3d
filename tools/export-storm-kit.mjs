import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
const base=process.env.STORM_URL??'http://127.0.0.1:5198',out='public/environment/storm-kit-v1',art='artifacts/storm-kit-v1';
await fs.mkdir(art,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${base}/tools/review/storm-kit-review.html`);
  await page.waitForFunction(()=>window.stormKit?.scene.isReady(),null,{timeout:90000});
  await page.screenshot({path:`${art}/kit.png`});
  const manifest={units:'metres',source:'src/survivor/storm-kit.ts',texture:'material-atlas.png',assets:[]};
  for(const asset of await page.evaluate(()=>window.stormKit.assets)){
    await page.evaluate(a=>window.stormKit.show(a),asset);
    await page.waitForFunction(()=>window.stormKit.scene.isReady());
    await page.screenshot({path:`${art}/${asset}.png`});
    const result=await page.evaluate(a=>window.stormKit.exportAsset(a),asset);
    const bytes=Buffer.from(result.base64,'base64'),validation=await validator.validateBytes(new Uint8Array(bytes));
    assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
    await fs.writeFile(`${out}/${asset}.glb`,bytes);
    manifest.assets.push({id:asset,file:`${asset}.glb`,triangles:result.triangles,bytes:bytes.length,validationErrors:0});
    console.log(`${asset}: ${result.triangles} triangles, valid textured GLB`);
  }
  await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
