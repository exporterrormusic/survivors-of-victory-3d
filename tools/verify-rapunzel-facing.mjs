import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const variant of ['c221_00','c226_00']){
await page.goto('http://127.0.0.1:5197/?run=test-range&character=rapunzel&enemies=inactive');
await page.evaluate(v=>localStorage.setItem('nikke-moba.roster-v1',JSON.stringify({ownedSkinIds:['c226_00'],equippedSkins:{rapunzel:v}})),variant);
await page.reload();await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
const results=await page.evaluate(async()=>{const {Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');const g=game,r=g.player.rig;g.engine.setHardwareScalingLevel(3);g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();const out=[];
for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const posture of ['relaxed','aim','shot','reload'])for(const moving of [false,true]){
for(let i=0;i<5;i++){r.update(.2,{moveX:moving?Math.sin(yaw):0,moveZ:moving?Math.cos(yaw):0,speed:moving?5:0,aimYaw:yaw,posture});g.scene.render();r.applyAim();}
const h=g.player.chibi.joint('Bip001 Head');const f=Vector3.TransformNormal(new Vector3(0,1,0),h.computeWorldMatrix(true));const angle=Math.atan2(f.x,f.z)-yaw;out.push({posture,moving,error:Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*180/Math.PI});}
return out;});
for(const r of results)assert.ok(r.error<(r.posture==='relaxed'?25:1),`${variant} ${JSON.stringify(r)}`);
console.log(variant,'max aimed error',Math.max(...results.filter(r=>r.posture!=='relaxed').map(r=>r.error)),'max walk error',Math.max(...results.filter(r=>r.posture==='relaxed').map(r=>r.error)));
await page.evaluate(()=>{game.player.rig.update(.2,{moveX:0,moveZ:0,speed:0,aimYaw:0,posture:'aim'});game.scene.render();game.player.rig.applyAim();game.scene.onAfterAnimationsObservable.add(()=>game.player.rig.applyAim());game.scene.render();});
await page.screenshot({path:`artifacts/rapunzel/facing-${variant}.png`});
}assert.deepEqual(errors,[]);console.log('PASS: default and Pure Grace face all four headings when idle, walking, aiming, firing and reloading.');
}finally{await browser.close();}
