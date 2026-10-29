import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5199/tools/review/sakura-kit-review.html');
 await page.waitForFunction(()=>window.sakuraKit?.scene.isReady());
 await page.evaluate(()=>{sakuraKit.show('sakura-shrine');sakuraKit.camera.alpha=-Math.PI/2;sakuraKit.camera.beta=1.48;sakuraKit.camera.radius=11;});
 await page.waitForFunction(()=>sakuraKit.scene.isReady());await page.waitForTimeout(500);
 await page.screenshot({path:'artifacts/shrine-doors-closed.png'});
 await page.evaluate(()=>{sakuraKit.camera.alpha=-1.05;});await page.waitForTimeout(250);
 await page.screenshot({path:'artifacts/shrine-doors-angle.png'});
 console.log(JSON.stringify({errors,doors:await page.evaluate(()=>['left','right'].map(s=>{const n=sakuraKit.scene.getTransformNodeByName('shrine-door-'+s);return {name:n.name,meshes:n.getChildMeshes().length,...n.metadata};}))}));
}finally{await browser.close();}
