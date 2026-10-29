import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const sizes=[];
 for(const width of [1440,1024,768]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  sizes.push(await page.evaluate(()=>{const ammo=document.querySelector('.rh-ammo'),r=ammo.getBoundingClientRect(),children=[...ammo.children].filter(e=>getComputedStyle(e).display!=='none');return {width:innerWidth,pips:document.querySelector('.rh-rounds').children.length,count:ammo.querySelector('b').textContent,contained:children.every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left-1&&c.right<=r.right+1;})};}));
 }
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'artifacts/nayuta/ammo-compact.png'});
 console.log(sizes);for(const s of sizes){assert.equal(s.pips,1);assert.ok(s.contained);assert.match(s.count,/30.*30/);}
}finally{await browser.close();}
