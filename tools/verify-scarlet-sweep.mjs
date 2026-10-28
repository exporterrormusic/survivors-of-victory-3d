import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const wave=process.argv.includes('--wave');
const fog=process.argv.includes('--fog');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5196/?run=test-range&character=scarlet&enemies=inactive'+(fog?'&environment=forest':''));
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.evaluate(wave=>{
  const g=game;g.engine.stopRenderLoop();g.scene.onBeforeRenderObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  g.player.ctx.teleport(new (g.player.position.constructor)(0,0,-9));g.camera.snap(g.player.position);
  g.player.aim.copyFrom(g.player.position).addInPlaceFromFloats(3,0,-5);
  g.atmosphere.update(3,g.camera.focus);
  if(wave){ g.kit.useSpecial();g.kit.update(.12);g.vfx.update(.12); }
  else {g.kit.fire(g.player.position,g.player.aim);g.vfx.update(.085);}
  g.scene.render();
 },wave);
 await fs.mkdir('artifacts/scarlet',{recursive:true});await page.screenshot({path: wave?'artifacts/scarlet/dash-wave.png':fog?'artifacts/scarlet/sword-sweep-fog.png':'artifacts/scarlet/sword-sweep.png'});
 console.log(JSON.stringify({errors,meshes:await page.evaluate(()=>game.scene.meshes.filter(m=>m.name.startsWith('scarlet-sword-sweep')).map(m=>({name:m.name,enabled:m.isEnabled()})))}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}

