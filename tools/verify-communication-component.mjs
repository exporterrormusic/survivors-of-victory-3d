import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/communication', {recursive:true});
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/communication-check', route => route.fulfill({contentType:'text/html',body:'<html><body style="background:#263237"><div id="hud"></div></body></html>'}));
 await page.goto('http://127.0.0.1:5174/communication-check');
 await page.evaluate(async()=>{
 const {CommunicationPanel}=await import('/src/ui/communication-panel.ts');
 const {createCommunicationLab}=await import('/src/survivor/communication-lab.ts');
 const panel=new CommunicationPanel(document.querySelector('#hud'));
 const lab=createCommunicationLab(panel);lab.element.style.cssText='position:absolute;right:20px;width:320px;color:white';document.body.append(lab.element);
 });



 await page.getByRole('button',{name:'Receive / replay'}).click();
 await page.waitForFunction(()=>document.querySelector('.communication-media img')?.naturalWidth > 0);
 await page.waitForTimeout(700);
 await page.screenshot({path:'artifacts/communication/component.png'});
 assert.equal(await page.locator('.communication-panel').isVisible(),true);
 await page.getByRole('button',{name:'End call',exact:true}).click();
 await page.waitForTimeout(400);
 assert.equal(await page.locator('.communication-panel').isVisible(),false);
 await page.getByRole('button',{name:'Receive / replay'}).click();
 await page.getByRole('button',{name:'End call',exact:true}).click();
 await page.getByRole('button',{name:'Receive / replay'}).click();
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.communication-panel').isVisible(),true);
 const checks = await page.evaluate(async()=>{
   const {CommunicationPanel} = await import('/src/ui/communication-panel.ts');
   const panel = new CommunicationPanel(document.body);
   panel.show({src:'/assets/menus/character-select/marian/portrait.png',kind:'image'});
   const samples = speed => {const values=[]; for(let i=0;i<300;i++){panel.update(1/60,speed,0);if(i>180)values.push(parseFloat(panel.element.style.transform.match(/translate\(([^p]+)/)[1]));}return Math.max(...values)-Math.min(...values);};
   const idle=samples(0), moving=samples(5), settled=samples(0);
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
   const ctx=canvas.getContext('2d');ctx.fillStyle='cyan';ctx.fillRect(0,0,64,64);
   const stream=canvas.captureStream(10);const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks=[];
   recorder.ondataavailable=e=>chunks.push(e.data);
   const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await new Promise(r=>setTimeout(r,300));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
   const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
   panel.show({src:url,kind:'video'});
   const video=panel.element.querySelector('video');await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
   const playing=!video.paused;panel.dispose();const disposed=!panel.element.isConnected && video.paused;URL.revokeObjectURL(url);
   return {idle,moving,settled,playing,disposed};
 });
 assert.ok(checks.moving>checks.idle*3);assert.ok(checks.settled<checks.moving/2);assert.ok(checks.playing);assert.ok(checks.disposed);
 console.log(JSON.stringify(checks));
} finally {await browser.close();}

