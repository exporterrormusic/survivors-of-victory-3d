import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 await fs.mkdir('artifacts/grey-ruins-v1',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});
 await page.goto('http://127.0.0.1:5192/?run=test-range&zone=city_dusk&time=dusk');
 console.log('Grey Ruins game opened');
 await page.waitForFunction(()=>window.game?.dressing?.theme==='city'&&window.game.scene.isReady(),{},{timeout:90000});
 await page.waitForFunction(()=>window.game.run.time>.3,{},{timeout:180000});
 const mood=await page.evaluate(()=>window.game.atmosphere.settings);
 if(mood.weather!=='overcast'||mood.time!=='day')throw Error('Grey Ruins did not override requested dusk');
 await page.waitForTimeout(2000);
 await page.screenshot({path:'artifacts/grey-ruins-v1/in-game.png'});
 await page.evaluate(()=>{const g=window.game;g.player.position.set(20,0,4);g.camera.setDistance(28);g.camera.snap(g.player.position);g.dressing.update(.5,g.player.position);});
 await page.waitForTimeout(500);
 await page.screenshot({path:'artifacts/grey-ruins-v1/street.png'});
 console.log(await page.evaluate(()=>({faded:window.game.dressing.meshes.filter(m=>m.visibility<.9).length})));
 await page.evaluate(()=>{const g=window.game;g.player.position.set(13,0,4);g.camera.snap(g.player.position);g.dressing.update(.5,g.player.position);});
 await page.screenshot({path:'artifacts/grey-ruins-v1/occlusion.png'});
 const faded=await page.evaluate(()=>window.game.dressing.meshes.filter(m=>m.visibility<.9).length);
 if(faded)throw Error('Ruins must remain opaque');
 console.log(`Opaque ruins verified; faded count ${faded} meshes`);
 console.log(await page.evaluate(()=>({theme:window.game.dressing.theme,meshes:window.game.dressing.meshes.length,particles:window.game.scene.particleSystems.filter(p=>p.name.includes('city')).length})));
 await fs.writeFile('artifacts/grey-ruins-v1/errors.json',JSON.stringify(errors));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}

