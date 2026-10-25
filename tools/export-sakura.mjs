import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.SAKURA_REVIEW_URL??'http://127.0.0.1:5183'}/sakura-review.html`);
  await page.waitForFunction(()=>window.sakuraReview?.scene.isReady(),{},{timeout:120000});
  await page.evaluate(()=>window.sakuraReview.pause());
  await fs.mkdir('artifacts/sakura-v1',{recursive:true});
  for(const [name,alpha,beta] of [['front',-Math.PI/2,1.14],['side',0,1.12],['back',Math.PI/2,1.12],['game-angle',-.9,.65]]) {
    await page.evaluate(({alpha,beta})=>{const g=window.sakuraReview;g.camera.alpha=alpha;g.camera.beta=beta;g.scene.render();},{alpha,beta});
    await page.screenshot({path:`artifacts/sakura-v1/${name}.png`});
  }
  const result=await page.evaluate(async()=>{
    const g=window.sakuraReview;
    const exported=await g.exportGLB();
    const bytes=new Uint8Array(await exported.glTFFiles['sakura-tree.glb'].arrayBuffer());
    if(bytes.length<10000)throw Error('Export is unexpectedly small; missing geometry or texture.');
    const meshes=g.tree.getChildMeshes();
    return {bytes:Array.from(bytes),meshes:meshes.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3})),textures:g.scene.textures.map(t=>({name:t.name,ready:t.isReady()}))};
  });
  await fs.writeFile('public/environment/sakura-v1/sakura-tree.glb',Buffer.from(result.bytes));
  delete result.bytes;result.errors=errors;
  await fs.writeFile('artifacts/sakura-v1/verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(errors.length)throw Error(errors.join('\n'));
} finally {await browser.close();}
