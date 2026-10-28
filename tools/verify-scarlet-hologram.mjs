import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage(); const errors=[];
 page.on('pageerror', e=>errors.push(e.message)); page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173/?run=test-range&character=scarlet&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.evaluate(()=>game.player.grantInvulnerability(10,true));
 await page.waitForTimeout(700);
 await page.screenshot({path:'artifacts/scarlet/retaliation-hologram.png'});
 if(errors.length) throw new Error(errors.join('\n'));
 console.log('PASS: hologram renders without shader or runtime errors');
} finally { await browser.close(); }
