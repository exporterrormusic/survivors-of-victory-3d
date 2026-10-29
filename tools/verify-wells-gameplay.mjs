import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true});try{
const p=await b.newPage({viewport:{width:1000,height:1000}});const renderErrors=[];p.on('console',m=>{if(/GL_INVALID|uniform buffer.*small|Unable to compile/i.test(m.text()))renderErrors.push(m.text());});await p.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=wells_research');await p.waitForFunction(()=>window.reviewReady);
const weapons=await p.evaluate(async()=>{
const {Engine,Scene,ArcRotateCamera,HemisphericLight,DirectionalLight,Vector3,Color4}=await import('/node_modules/.vite/deps/@babylonjs_core.js');const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');const {TwinStickRig}=await import('/src/survivor/rig.ts');
document.body.innerHTML='<canvas id="c" width="1000" height="1000" style="width:100vw;height:100vh"></canvas>';const e=new Engine(document.querySelector('#c'),true,{preserveDrawingBuffer:true});const s=new Scene(e);s.clearColor=new Color4(.12,.15,.2,1);const cam=new ArcRotateCamera('cam',1,1.1,3.7,new Vector3(0,1,0),s);new HemisphericLight('light',Vector3.Up(),s);
const {createAnimeLook}=await import('/src/toon.ts');const {InvincibilityHologram}=await import('/src/survivor/invincibility-hologram.ts');const toon=createAnimeLook(s,cam,new DirectionalLight('sun',new Vector3(-1,-2,1),s));toon.setEnabled(true);const idx=await loadChibiIndex();const ch=await Chibi.load(s,idx.variants.wells_research);new InvincibilityHologram(ch);const r=new TwinStickRig(ch);s.onAfterAnimationsObservable.add(()=>r.applyAim());
for(let i=0;i<120;i++){r.update(1/60,{moveX:0,moveZ:0,speed:0,aimYaw:0,posture:'aim'});s.render();}
window.probe={e,s,cam,ch,r,Vector3};return ch.meshes.filter(m=>m.name.includes('weapon')).map(m=>({name:m.name,visible:m.isVisible,enabled:m.isEnabled(),verts:m.getTotalVertices(),bounds:m.getBoundingInfo().boundingBox.centerWorld.asArray()}));});
assert.ok(weapons.some(m=>m.visible&&m.enabled&&m.verts>0),'Wells rifle must be visible');
await p.evaluate(async()=>{await window.probe.s.whenReadyAsync();window.probe.s.render();});
await p.evaluate(()=>{const m=window.probe.ch.meshes.find(m=>m.name.includes('weapon'));if(m.subMeshes[0].effect.fragmentSourceCode.includes('wellsClockTime'))throw Error('Rifle reused the eye-clock shader');});
const report=await p.evaluate(()=>{
const {s,ch,r,Vector3}=window.probe; s.onAfterAnimationsObservable.clear();const physics=ch.root.metadata.wellsCoatPhysics;physics.enabled=false;
const coat=ch.meshes.find(m=>m.name.startsWith('Wells_Coat_Continuous'));const rest=coat.getVerticesData('position'); const results=[];
for(const posture of ['aim','shot','reload'])for(const move of [0,1,-1]){
 let min=Infinity,worst=0,worstRest=[],maxHeadTilt=0,maxAimError=0;physics.reset();
 for(let frame=0;frame<120;frame++){
 r.update(1/60,{moveX:move,moveZ:0,speed:Math.abs(move)*3,aimYaw:0,posture});
 for(const g of s.animationGroups)if(g.weight>0){g.pause();g.goToFrame(g.from+(g.to-g.from)*(frame%60)/60);}
 r.applyAim();physics.enabled=true;physics.step(1/60);physics.enabled=false;
 const headUp=Vector3.TransformNormal(Vector3.Up(),ch.joint('Bip001 Head').computeWorldMatrix(true)).normalize();maxHeadTilt=Math.max(maxHeadTilt,Math.acos(Math.min(1,headUp.y)));
 if(frame>15&&posture!=='reload')maxAimError=Math.max(maxAimError,Math.abs(r.gunYaw()));
 coat.computeWorldMatrix(true);coat.skeleton.prepare(true);const posed=coat.getPositionData(true,false);
 for(const side of ['L','R']){const a=ch.joint(`Bip001 ${side} Thigh`).getAbsolutePosition(),b=ch.joint(`Bip001 ${side} Calf`).getAbsolutePosition(),axis=b.subtract(a),radius=axis.length()*.28+.008;
 for(let v=0;v<rest.length;v+=3){if(rest[v+1]>.90||rest[v+1]<.55||Math.abs(rest[v])>.36)continue;const p=Vector3.TransformCoordinates(Vector3.FromArray(posed,v),coat.getWorldMatrix());const u=Math.max(0,Math.min(1,Vector3.Dot(p.subtract(a),axis)/axis.lengthSquared()));const clearance=Vector3.Distance(p,a.add(axis.scale(u)))-radius;if(clearance<min){min=clearance;worst=frame;worstRest=Array.from(rest.slice(v,v+3));}}
 }
 }
 results.push({posture,move,min,worst,worstRest,maxHeadTilt,maxAimError});
}
return results;
});
await fs.writeFile('artifacts/wells/gameplay-validation.json',JSON.stringify(report,null,2));
for(const row of report){assert.ok(row.min>=0,JSON.stringify(row));assert.ok(row.maxHeadTilt<.01,JSON.stringify(row));assert.ok(row.maxAimError<.01,JSON.stringify(row));}
console.log(report);
await p.evaluate(()=>window.probe.s.render());
await p.screenshot({path:'artifacts/wells/gameplay-reload-checked.png'});
assert.deepEqual(renderErrors,[]);
}finally{await b.close();}

