import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/marian',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=c260_02');await page.waitForFunction(()=>window.reviewReady);
 const reports=[];
 for(const variant of ['c260_00','c260_01','c260_02','c013_00','c019_00','c019_01']){
 reports.push(await page.evaluate(async variant=>{
  const {Engine,Scene,ArcRotateCamera,HemisphericLight,Vector3,Matrix}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');const {TwinStickRig}=await import('/src/survivor/rig.ts');
  window.marianReview?.scene.dispose();window.marianReview?.engine.dispose();
  document.body.innerHTML='<canvas id="c" width="1000" height="900" style="width:100vw;height:100vh"></canvas>';
  const engine=new Engine(document.querySelector('#c'),true,{preserveDrawingBuffer:true}),scene=new Scene(engine);
  const camera=new ArcRotateCamera('camera',-Math.PI/2,.9,5,new Vector3(0,1,0),scene);new HemisphericLight('light',Vector3.Up(),scene);
  const index=await loadChibiIndex(),chibi=await Chibi.load(scene,index.variants[variant]),rig=new TwinStickRig(chibi);
  const names=variant==='c260_02'?['Dummy_Wp_root']:variant.startsWith('c019')?['Bip001 Prop1','Bip001 Prop2']:[];
  const spine=chibi.joint('Bip001 Spine');let maxRelativeError=0,maxAimError=0,minAttachmentScale=Infinity;let hoverReference=null;
  const relative=node=>{const refresh=n=>{if(n.parent)refresh(n.parent);n.computeWorldMatrix(true);};refresh(node);refresh(spine);return node.getWorldMatrix().multiply(Matrix.Invert(spine.getWorldMatrix()));};
  for(const posture of ['aim','shot','reload'])for(const direction of [-1,1])for(let frame=0;frame<45;frame++){
   rig.update(1/60,{moveX:0,moveZ:1,speed:3,aimYaw:direction*Math.PI/2,posture});
   for(const g of scene.animationGroups)if(g.weight>0){g.pause();g.goToFrame(g.from+(g.to-g.from)*(frame/45));}
   const before=names.map(name=>relative(chibi.joint(name)));rig.applyAim();
   for(let i=0;i<names.length;i++){
    const node=chibi.joint(names[i]),after=relative(node);
    if(variant==='c260_02'){
     hoverReference??=after.clone();
     minAttachmentScale=Math.min(minAttachmentScale,Math.abs(node.scaling.x),Math.abs(node.scaling.y),Math.abs(node.scaling.z));
    }
    const reference=variant==='c260_02'?hoverReference:before[i];
    for(let k=0;k<16;k++)maxRelativeError=Math.max(maxRelativeError,Math.abs(reference.m[k]-after.m[k]));
   }
   if(frame>15&&posture!=='reload')maxAimError=Math.max(maxAimError,Math.abs(Math.atan2(Math.sin(rig.gunYaw()-direction*Math.PI/2),Math.cos(rig.gunYaw()-direction*Math.PI/2))));
  }
  await scene.whenReadyAsync();scene.render();window.marianReview={scene,engine,rig,chibi,camera};
  return {variant,attachments:names,maxRelativeError,maxAimError,minAttachmentScale:Number.isFinite(minAttachmentScale)?minAttachmentScale:null};
 },variant));
 await page.screenshot({path:`artifacts/marian/${variant}-aim-right.png`});
 }
 await fs.writeFile('artifacts/marian/aim-validation.json',JSON.stringify({reports,errors},null,2));
 for(const r of reports){assert.ok(r.maxRelativeError<.001,JSON.stringify(r));assert.ok(r.maxAimError<.01,JSON.stringify(r));if(r.variant==='c260_02')assert.ok(r.minAttachmentScale>.5,'Hover assembly must remain visible in every aim/shot/reload frame');}
 assert.deepEqual(errors,[]);console.log(reports);
}finally{await browser.close();}
