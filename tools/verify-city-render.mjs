import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5192/?run=test-range&zone=city_day');
 await page.waitForFunction(()=>window.game?.dressing?.theme==='city'&&window.game.scene.isReady(),{},{timeout:90000});
 await page.waitForFunction(()=>window.game.run.time>.3,{},{timeout:180000});
 const report=await page.evaluate(()=>{
  const g=window.game,s=g.scene,meshes=g.dressing.meshes;
  return {particlesEnabled:s.particlesEnabled,particles:s.particleSystems.filter(p=>p.name.includes('city')).map(p=>({name:p.name,active:p.getActiveCount(),speed:p.updateSpeed})),materials:[...new Set(meshes.map(m=>m.material))].map(m=>({name:m.name,alpha:m.alpha,mode:m.transparencyMode,depth:m.disableDepthWrite,texture:m.diffuseTexture?.name})),glows:s.effectLayers.map(l=>({name:l.name,occluders:meshes.filter(m=>l.hasMesh(m)).length}))};
 });
 if(report.materials.some(m=>m.alpha!==1||m.mode!==0||m.depth||!m.texture))throw Error('City surface is not textured and opaque');
 if(report.glows.some(g=>g.occluders!==28))throw Error('Glow pass lacks city depth occluders');
 if(report.particles.some(p=>p.active===0||p.speed===0))throw Error('City effects are not running');
 console.log(report);
 await page.evaluate(()=>{const g=window.game;g.player.position.set(12,0,12);g.camera.setDistance(24);g.camera.snap(g.player.position);});
 await page.waitForTimeout(3000);await page.screenshot({path:'artifacts/grey-ruins-v1/dust-detail.png'});
}finally{await browser.close();}
