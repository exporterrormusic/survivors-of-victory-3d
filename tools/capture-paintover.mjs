// Capture actual game geometry in four orthographic projections, ready for a paint-over.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const root='assets/environment-source/paintover-v1';
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});
const catalog={defenses:['tower','fort','keep'],mechanisms:['turret','core'],environment:['hangar','ruin','cliff'],barriers:['wall','wreck']};
const manifest=JSON.parse(await fs.readFile(`${root}/projections.json`,'utf8').catch(()=>'null'))??{cell:512,columns:['front','back','side','top'],atlases:{}};
try {
 const page=await browser.newPage({viewport:{width:512,height:512}});
 await page.goto('http://127.0.0.1:5182/?hero=snow-white&map=three-lane');
 await page.waitForFunction(()=>window.game?.hero&&window.game.scene.isReady(),{},{timeout:120000});
 await page.evaluate(async()=>{
  const g=window.game,B=await import('/node_modules/.vite/deps/@babylonjs_core.js');window.paintB=B;
  g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onBeforeRenderObservable.clear();
  g.scene.onAfterRenderObservable.clear();g.scene.postProcessesEnabled=false;g.scene.shadowsEnabled=false;g.scene.fogEnabled=false;
  for(const layer of g.scene.effectLayers)layer.isEnabled=false;
  g.scene.clearColor=new B.Color4(.13,.17,.2,1);g.scene.ambientColor.set(.15,.15,.15);
  g.scene.getLightByName('sun').intensity=.9;g.scene.getLightByName('hemi').intensity=.65;
  for(const m of g.scene.meshes)m.layerMask=0;
  document.getElementById('hud').style.display='none';
  document.getElementById('frame').style.cssText='position:absolute;left:0;top:0;width:512px;height:512px;';
  g.engine.setSize(512,512);g.cam.camera.layerMask=1;g.cam.camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;
  g.cam.camera.minZ=.01;g.cam.camera.maxZ=200;
  window.paintClones=[];
 });
 for(const [atlas,rows] of Object.entries(catalog)) {
  if(process.argv[2] && process.argv[2]!==atlas)continue;
  const tiles=[],specs=[];
  for(const name of rows) {
   const bounds=await page.evaluate(async name=>{
    const g=window.game,B=window.paintB;
    for(const m of window.paintClones)m.dispose();window.paintClones=[];
    let originals=[];
    if(['tower','fort','keep'].includes(name))originals=[g.combat.structures.find(s=>s.team==='blue'&&s.site.kind===name).body];
    else if(name==='turret')originals=[g.combat.structures.find(s=>s.site.kind==='tower').head];
    else if(name==='core'){const s=g.combat.structures.find(s=>s.team==='blue'&&s.site.kind==='core');originals=[s.body,s.head];}
    else if(name==='wreck')originals=[g.combat.structures.find(s=>s.team==='blue'&&s.site.kind==='tower').rubble];
    else if(name==='wall')originals=g.scene.getTransformNodeByName('blue-mid-outer-walls').getChildMeshes(true).filter(m=>m.position.x>0);
    else if(name==='cliff'){const {brokenPier}=await import('/src/environment.ts');const m=brokenPier(g.scene,1.65,3.7,()=>.5);m.layerMask=0;originals=[m];}
    else {const parent=g.scene.getTransformNodeByName(name==='hangar'?'blue-deployment-hall':'ruin-cover-0');originals=parent.getChildMeshes(true).filter(m=>!m.name.includes('ivy')&&!m.name.includes('fern'));}
    let min=new B.Vector3(Infinity,Infinity,Infinity),max=new B.Vector3(-Infinity,-Infinity,-Infinity);
    for(const original of originals) {
      const m=original.clone(`paint-${name}`,null);m.parent=null;m.unfreezeWorldMatrix();m.layerMask=1;m.setEnabled(true);m.isVisible=true;m.visibility=1;
      if(['tower','fort','keep','turret','core','cliff','wreck'].includes(name)){m.position.setAll(0);m.rotation.setAll(0);m.rotationQuaternion=null;m.scaling.setAll(1);}
      if(name==='wall')m.position.x-=5.1;
      const material=new B.StandardMaterial(`capture-${name}`,g.scene);material.diffuseColor.set(.52,.59,.63);material.specularColor.set(0,0,0);m.material=material;
      m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox;min=B.Vector3.Minimize(min,box.minimumWorld);max=B.Vector3.Maximize(max,box.maximumWorld);window.paintClones.push(m);
    }
    const center=min.add(max).scale(.5),size=max.subtract(min),span=Math.max(size.x,size.y,size.z)*1.16;
    window.paintBounds={center:center.asArray(),span,size:size.asArray()};return window.paintBounds;
   },name);
   specs.push({name,...bounds});
   for(const view of ['front','back','side','top']) {
    await page.evaluate(view=>{
      const g=window.game,B=window.paintB,{center,span}=window.paintBounds,c=new B.Vector3(...center),camera=g.cam.camera;
      camera.upVector.set(0,1,0);
      const offset=view==='front'?new B.Vector3(0,0,30):view==='back'?new B.Vector3(0,0,-30):view==='side'?new B.Vector3(30,0,0):new B.Vector3(0,30,0);
      if(view==='top')camera.upVector.set(0,0,1);
      camera.position.copyFrom(c.add(offset));camera.setTarget(c);
      camera.orthoLeft=-span/2;camera.orthoRight=span/2;camera.orthoTop=span/2;camera.orthoBottom=-span/2;
      g.scene.render();g.scene.render();
    },view);
    const buffer=await page.locator('#game').screenshot();tiles.push(buffer.toString('base64'));
    await fs.writeFile(`${root}/${name}-${view}-blockout.png`,buffer);
   }
  }
  const data=await page.evaluate(async({tiles,rows})=>{
   const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=rows*512;const ctx=canvas.getContext('2d');
   for(let i=0;i<tiles.length;i++){const image=new Image();image.src=`data:image/png;base64,${tiles[i]}`;await image.decode();ctx.drawImage(image,(i%4)*512,Math.floor(i/4)*512,512,512);}
   return canvas.toDataURL('image/png').split(',')[1];
  },{tiles,rows:rows.length});
  await fs.writeFile(`${root}/${atlas}-blockout.png`,Buffer.from(data,'base64'));manifest.atlases[atlas]=specs;
 }
 await fs.writeFile(`${root}/projections.json`,JSON.stringify(manifest,null,2));console.log(manifest);
}finally{await browser.close();}
