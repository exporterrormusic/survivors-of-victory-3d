import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[], missing=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('dorothy'))missing.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('nikke-moba.roster-v1',JSON.stringify({selectedCharacterId:'dorothy'})));
 await page.goto('http://127.0.0.1:5197/?preview=character-select');
 await page.waitForSelector('canvas');
 await page.waitForTimeout(3000);
 console.log('MENU', await page.evaluate(()=>({save:localStorage.getItem('nikke-moba.roster-v1'),resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('dorothy')).map(r=>r.name)})), errors, missing);
 await page.waitForTimeout(1800);
 await page.screenshot({path:'artifacts/dorothy/lineup-user-art.png'});
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const art=await page.locator('.rb-art').evaluate(e=>({image:e.style.backgroundImage,position:e.style.backgroundPosition}));
 assert.ok(art.image.includes('/dorothy-burst-banner-v2.png'));assert.equal(art.position,'50% 50%');
 await page.evaluate(()=>{game.engine.setHardwareScalingLevel(3);game.engine.stopRenderLoop();});
 await page.locator('.rd-burst').screenshot({path:'artifacts/dorothy/hud-user-art.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 console.log({art,errors,missing});
} finally {await browser.close();}
