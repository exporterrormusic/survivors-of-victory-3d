import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5199/tools/review/forest-kit-review.html');
 await page.waitForFunction(()=>window.forestKit?.scene.isReady());
 await page.evaluate(()=>forestKit.show('forest-sake-set'));
 await page.waitForFunction(()=>forestKit.scene.isReady());await page.waitForTimeout(700);
 await page.screenshot({path:'artifacts/sake-set-front.png'});
 await page.evaluate(()=>{forestKit.camera.alpha=Math.PI/2+.12;});await page.waitForTimeout(300);
 await page.screenshot({path:'artifacts/sake-set-back.png'});
 console.log(JSON.stringify({errors,info:await page.evaluate(()=>{const r=forestKit.scene.getTransformNodeByName('forest-sake-set');return {metadata:r.metadata,meshes:r.getChildMeshes().length,textures:forestKit.scene.textures.every(t=>t.isReady())};})}));
 if(errors.length)process.exitCode=1;
} finally {await browser.close();}
