import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:600,height:600}});
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=aya');await page.waitForFunction(()=>window.reviewReady);
 const captures=await page.evaluate(async()=>{
  const {EngineStore}=await import('/node_modules/.vite/deps/@babylonjs_core.js');const s=EngineStore.LastCreatedScene;const c=s.activeCamera;c.alpha=-Math.PI/2;c.beta=Math.PI/2;c.radius=1.65;c.target.set(0,1.62,0);
  const result=[];
  for(const name of ['talk_1','talk_2','talk_idle']){
   for(const g of s.animationGroups)g.stop();const g=s.animationGroups.find(g=>g.name===name);g.start(true);g.pause();
   for(let i=0;i<16;i++){
    g.goToFrame(g.from+(g.to-g.from)*i/15);s.render();result.push({name,phase:i/15,url:s.getEngine().getRenderingCanvas().toDataURL()});
   }
  }
  s.getEngine().stopRenderLoop();return result;
 });
 await page.setViewportSize({width:1600,height:1200});
 await page.setContent('<body style="margin:0;background:#222;color:white;font:16px sans-serif"></body>');
 for(const name of ['talk_1','talk_2','talk_idle']){
  await page.evaluate(items=>{document.body.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,1fr)">'+items.map(x=>`<div><div>${x.name} ${x.phase.toFixed(2)}</div><img style="width:100%;height:270px;object-fit:contain" src="${x.url}"></div>`).join('')+'</div>';},captures.filter(x=>x.name===name));
  await page.screenshot({path:`artifacts/aya/blink-${name}.png`});
 }
 await fs.writeFile('artifacts/aya/talk-validation.json',JSON.stringify({clips:['talk_1','talk_2','talk_idle'],samplesPerClip:16,total:captures.length},null,2));
 console.log('Captured 48 talk/blink poses.');
}finally{await browser.close();}
