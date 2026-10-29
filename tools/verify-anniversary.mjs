import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/anniversary',{recursive:true});
const browser=await chromium.launch();try{const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>console.log('ERROR',e.message));
await p.route('**/src/app.ts*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
await p.route('**/@vite/client',r=>r.fulfill({body:'export function createHotContext(){return {accept(){},prune(){}}} export function updateStyle(id,css){const el=document.createElement("style");el.textContent=css;document.head.append(el);} export function removeStyle(){} export function injectQuery(url,query){return url+(url.includes("?")?"&":"?")+query;}',contentType:'text/javascript'}));
await p.goto('http://127.0.0.1:5199');
await p.evaluate(async()=>{document.body.innerHTML='<canvas id="source" width="1920" height="1080" style="position:absolute;left:0;top:45px;width:1440px;height:810px"></canvas><div id="frame"></div>';document.body.style.background='#101923';const source=document.getElementById('source');source.getContext('2d').fillRect(0,0,1920,1080);window.transition=await import('/src/frontend/level-transition.ts');transition.holdLevelTransition(source);});
let bounds=await p.locator('#level-transition').boundingBox();assert.equal(bounds.y,45);assert.equal(bounds.height,810);
await p.screenshot({path:'artifacts/anniversary/transition-16x9.png'});
await p.evaluate(()=>{document.getElementById('source').remove();document.getElementById('frame').style.cssText='position:absolute;left:0;top:141px;width:1440px;height:617px';});
await p.evaluate(()=>{document.getElementById('frame').style.cssText='position:absolute;left:-500px;top:-500px;width:4000px;height:3000px';});
bounds=await p.locator('#level-transition').boundingBox();assert.equal(bounds.y,45);assert.equal(bounds.height,810);
await p.screenshot({path:'artifacts/anniversary/transition-21x9.png'});
await p.evaluate(()=>transition.revealLevelTransition());assert.equal(await p.locator('#level-transition').count(),0);
console.log('Transition: locked 16:9 bounds despite oversized destination, reveal cleanup passed.');
await p.evaluate(async()=>{document.body.replaceChildren();document.body.style.cssText='margin:0;background:#101923;color:white;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;font:16px sans-serif';const {SkinModelPreview}=await import('/src/frontend/ui/SkinModelPreview.ts');const {characterSkins}=await import('/src/frontend/profile/Skins.ts');window.previews=[];for(const [character,id] of [['rapunzel','c473_00'],['scarlet','c472_00'],['snow-white','c471_01'],['marian','c019_00'],['marian','c019_01']]){const skin=characterSkins(character).find(s=>s.id===id);if(!skin)throw Error('Not registered '+id);const tile=document.createElement('section');tile.textContent=skin.name;const preview=new SkinModelPreview();previews.push(preview);preview.element.style.cssText='position:relative;width:100%;height:365px';tile.append(preview.element);document.body.append(tile);preview.element.querySelector('canvas').style.cssText='width:100%;height:100%';await preview.show(skin,'idle');if(preview.element.dataset.model!==id)throw Error('Failed preview '+id);}});
await p.screenshot({path:'artifacts/anniversary/models.png'});console.log('All five models loaded and rendered in the skin preview.');
}finally{await browser.close();}


