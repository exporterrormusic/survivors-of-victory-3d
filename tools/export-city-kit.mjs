import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import validator from 'gltf-validator';
const browser=await chromium.launch({headless:true});
const out='public/environment/grey-ruins-v1',art='artifacts/grey-ruins-v1';
await fs.mkdir(out,{recursive:true});await fs.mkdir(art,{recursive:true});
const errors=[],manifest={units:'metres',style:'painted anime ruins',assets:[]};
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.CITY_REVIEW_URL??'http://127.0.0.1:5192'}/tools/review/city-kit-review.html`);
 await page.waitForFunction(()=>window.cityKit?.scene.isReady(),{},{timeout:60000});
 await page.screenshot({path:`${art}/kit.png`});
 for(const asset of await page.evaluate(()=>window.cityKit.assets)){
  const result=await page.evaluate(a=>window.cityKit.exportAsset(a),asset);
  const bytes=Buffer.from(result.base64,'base64'),validation=await validator.validateBytes(new Uint8Array(bytes));
  if(validation.issues.numErrors)throw Error(`${asset}: ${JSON.stringify(validation.issues)}`);
  await fs.writeFile(`${out}/${asset}.glb`,bytes);
  manifest.assets.push({id:asset,file:`${asset}.glb`,triangles:result.triangles,bytes:bytes.length,validationErrors:0});
  console.log(`${asset}: ${result.triangles} triangles, valid GLB`);
 }
 await page.evaluate(()=>{window.cityKit.show('layout');window.cityKit.camera.beta=.62;window.cityKit.camera.radius=100;});
 await page.screenshot({path:`${art}/layout.png`});
 await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`Exported and validated ${manifest.assets.length} city assets.`);
 await page.goto(`${process.env.CITY_REVIEW_URL??'http://127.0.0.1:5192'}/?run=test-range&zone=city_dusk&time=dusk`);
 await page.waitForFunction(()=>window.game?.dressing?.theme==='city'&&window.game.scene.isReady(),{},{timeout:90000});
 await page.waitForTimeout(2500);
 await page.screenshot({path:`${art}/in-game.png`});
 console.log(await page.evaluate(()=>({theme:window.game.dressing.theme,meshes:window.game.dressing.meshes.length,particles:window.game.scene.particleSystems.filter(p=>p.name.includes('city')).length})));
 await fs.writeFile(`${art}/errors.json`,JSON.stringify(errors,null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}

