import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5207/enemy-effects.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Three models ready',null,{timeout:90000});
 await fs.mkdir('artifacts/enemy-effects',{recursive:true});
 for(let i=0;i<3;i++){
  await page.selectOption('#enemy',String(i));
  await page.waitForTimeout(500);
  const before=await page.locator('canvas').screenshot();
  await page.waitForTimeout(1200);
  const after=await page.locator('canvas').screenshot();
  assert.notDeepEqual(before,after,`Model ${i} should animate`);
  await page.screenshot({path:`artifacts/enemy-effects/${i}.png`});
 }
 await page.click('#pause');
 const time=await page.evaluate(()=>window.enemyPreview.time);
 await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>window.enemyPreview.time),time);
 await page.check('#original');
 assert.equal(await page.evaluate(()=>window.enemyPreview.scene.meshes.filter(m=>m.getTotalVertices()>0).every(m=>m.material.getClassName()==='PBRMaterial')),true);
 await page.uncheck('#original');
 assert.equal(await page.evaluate(()=>window.enemyPreview.scene.meshes.filter(m=>m.getTotalVertices()>0).every(m=>m.material.getClassName()==='ShaderMaterial')),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: three animated effects, pause, original comparison, no browser or shader errors.');
} finally {await browser.close();}
