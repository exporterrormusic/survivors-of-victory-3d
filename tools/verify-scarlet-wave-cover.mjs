import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5196/');
 const results=await page.evaluate(async()=>{
 const {waveCoverContact}=await import('/src/survivor/scarlet/wave-cover.ts');
 const {traceScenery}=await import('/src/survivor/range-collision.ts');
 const from={x:0,y:0,z:0},to={x:0,y:0,z:6};
 const check=(x,z,scale,height=2)=>waveCoverContact(from,to,0,scale,(a,b,p)=>traceScenery([{x,z,r:.12,height}],a,b,p))!==null;
 return {side:check(1.8,3,1),charged:check(5.5,3,3),far:check(8,3,1),low:check(1.8,3,1,.1),thin:check(0,3,1)};
 });
 assert.deepEqual(results,{side:true,charged:true,far:false,low:false,thin:true});console.log('PASS',results);
}finally{await browser.close();}
