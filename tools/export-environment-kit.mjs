import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import validator from 'gltf-validator';
const browser=await chromium.launch({headless:true});
const out='public/environment/kit-v1',art='artifacts/environment-kit-v1';
await fs.mkdir(out,{recursive:true});await fs.mkdir(art,{recursive:true});
const errors=[],manifest={version:1,units:'metres',style:'simple anime',assets:[]};
try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(`${process.env.KIT_REVIEW_URL??'http://127.0.0.1:5183'}/tools/review/environment-kit-review.html`);
  await page.waitForFunction(()=>window.environmentKit?.scene.isReady(),{},{timeout:120000});
  const {assets,finishes}=await page.evaluate(()=>({assets:window.environmentKit.assets,finishes:window.environmentKit.finishes}));
  for(const finish of finishes){
    await page.evaluate(f=>window.environmentKit.setFinish(f),finish);
    await page.screenshot({path:`${art}/collection-${finish}.png`});
    for(const asset of assets){
      const result=await page.evaluate(({id,finish})=>window.environmentKit.exportAsset(id,finish),{id:asset.id,finish});
      const bytes=Buffer.from(result.bytes);delete result.bytes;
      if(bytes.length<1000||!result.triangles)throw Error(`Empty export: ${asset.id}`);
      const filename=`${asset.id}-${finish}.glb`;
      const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:filename});
      if(validation.issues.numErrors)throw Error(`${filename}: ${JSON.stringify(validation.issues.messages)}`);
      await fs.writeFile(`${out}/${filename}`,bytes);
      manifest.assets.push({...asset,finish,file:filename,bytes:bytes.length,...result,validation:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings}});
    }
    console.log(`${finish}: ${assets.length} models exported and validated`);
  }
  for(const finish of finishes){
    await page.evaluate(f=>{const g=window.environmentKit;g.setFinish(f);g.show('assembly');},finish);
    await page.screenshot({path:`${art}/assembly-${finish}.png`});
  }
  await page.evaluate(()=>{window.environmentKit.setFinish('clean');window.environmentKit.show('plant-fern');});
  await page.screenshot({path:`${art}/fern-close.png`});
  await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
  await fs.writeFile(`${art}/verification.json`,JSON.stringify({models:manifest.assets.length,totalBytes:manifest.assets.reduce((n,a)=>n+a.bytes,0),pageErrors:errors,validationErrors:0},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log(`${manifest.assets.length} models complete`);
}finally{await browser.close();}
