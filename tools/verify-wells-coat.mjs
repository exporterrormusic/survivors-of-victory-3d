import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/tools/review/chibi-review.html?variant=wells_research');
 await page.waitForFunction(()=>window.reviewReady);
 const report=await page.evaluate(async()=>{
  const {Engine,Scene,ArcRotateCamera,HemisphericLight,Vector3,Color4}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');
  document.body.innerHTML='<canvas id="coat" width="1000" height="1000" style="width:100vw;height:100vh"></canvas>';
  const engine=new Engine(document.getElementById('coat'),true,{preserveDrawingBuffer:true});
  const scene=new Scene(engine);scene.clearColor=new Color4(.12,.15,.2,1);
  const camera=new ArcRotateCamera('coat',Math.PI-.5,1.35,2.8,new Vector3(0,1,0),scene);camera.minZ=.02;
  new HemisphericLight('light',Vector3.Up(),scene);
  const index=await loadChibiIndex(), chibi=await Chibi.load(scene,index.variants.wells_research);
  for(const m of chibi.meshes)if(m.name.includes('weapon'))m.isVisible=false;
  const physics=chibi.root.metadata.wellsCoatPhysics;physics.enabled=false;
  if(physics.stats.panels!==11)throw Error('Expected 11 simulated coat panels');
  const result=[];
  for(const fps of [30,60,120])for(const name of ['walk','run']) {
   physics.reset();chibi.root.position.setAll(0);chibi.play(name,{fade:0,loop:true});chibi.update(.016);
   const group=chibi.animationGroup(name);group.pause();let contacts=0,maxSwing=0,minClearance=Infinity,worstPhase=0,maxAngularSpeed=0;
   const previousRotations=[];
   const coat=chibi.meshes.find(m=>m.name.startsWith('Wells_Coat_Continuous'));
   const rest=coat.getVerticesData('position');
   for(let frame=0;frame<fps*3;frame++) {
    const t=frame/fps;group.goToFrame(group.from+(group.to-group.from)*(t%chibi.duration(name))/chibi.duration(name));
    chibi.root.position.z=t*(name==='run'?2:1);
    physics.enabled=true;physics.step(1/fps);physics.enabled=false;
    contacts+=physics.stats.contacts;maxSwing=Math.max(maxSwing,physics.stats.maxSwing);
    if(fps===60) {
     // Check the rendered, weighted hem vertices on every frame of three
     // complete seconds, not only the solver's particle centerlines.
     coat.computeWorldMatrix(true);coat.skeleton.prepare(true);
     const posed=coat.getPositionData(true,false);
     for(const side of ['L','R']) {
      const a=chibi.joint(`Bip001 ${side} Thigh`).getAbsolutePosition();
      const b=chibi.joint(`Bip001 ${side} Calf`).getAbsolutePosition();
      const axis=b.subtract(a),length=axis.length();const radius=length*.28+.008;
      for(let v=0;v<rest.length;v+=3) {
       if(rest[v+1]>.80 || rest[v+1]<.55)continue;
       const p=Vector3.TransformCoordinates(Vector3.FromArray(posed,v),coat.getWorldMatrix());
       const u=Math.max(0,Math.min(1,Vector3.Dot(p.subtract(a),axis)/axis.lengthSquared()));
       const clearance=Vector3.Distance(p,a.add(axis.scale(u)))-radius;
       if(clearance<minClearance){minClearance=clearance;worstPhase=(t%chibi.duration(name))/chibi.duration(name);}
      }
     }
    }
    for(let i=0;i<11;i++) {
     const q=chibi.joint('Wells_Hem_'+String(i).padStart(2,'0')).rotationQuaternion;
     if(!q.asArray().every(Number.isFinite)||Math.abs(q.length()-1)>.001)throw Error('Invalid hem bone');
     const previous=previousRotations[i];
     if(previous && frame>fps*.25) {
      const dot=Math.abs(q.x*previous.x+q.y*previous.y+q.z*previous.z+q.w*previous.w);
      maxAngularSpeed=Math.max(maxAngularSpeed,2*Math.acos(Math.min(1,dot))*fps);
     }
     previousRotations[i]=q.clone();
    }
   }
   if(maxSwing<.01 || maxSwing>1.65)throw Error(`Unexpected ${name} motion: ${maxSwing}`);
   // The old solver injected collision corrections into velocity and peaked
   // above 10.8 rad/s in every case. Keep that outward kick from returning.
   if(maxAngularSpeed>10.2)throw Error(`${name} coat impulse at ${fps} FPS: ${maxAngularSpeed} rad/s`);
   if(!contacts)throw Error('Thigh collision never engaged');
   if(fps===60 && (!Number.isFinite(minClearance)||minClearance<0))throw Error(`${name} rendered hem clearance ${minClearance}, phase ${worstPhase}`);
   result.push({fps,clip:name,contacts,maxSwing,maxAngularSpeed,minClearance:Number.isFinite(minClearance)?minClearance:null,worstPhase});
  }
  chibi.root.position.set(50,0,-50);physics.enabled=true;physics.step(.5);physics.enabled=false;
  if(physics.stats.resets<7)throw Error('Teleport reset did not run');
  chibi.root.position.setAll(0);physics.reset();
  window.coatReview={chibi,physics,scene,camera,engine};
  return result;
 });
 for(const name of ['walk','run'])for(const phase of [.15,.4,.7,report.find(r=>r.fps===60&&r.clip===name).worstPhase]) {
  await page.evaluate(({name,phase})=>{
   const {chibi,physics,scene}=window.coatReview;chibi.play(name,{fade:0,loop:true});chibi.update(.016);
   const g=chibi.animationGroup(name);g.pause();physics.reset();
   for(let i=0;i<60;i++) {
    const t=phase*chibi.duration(name)-(59-i)/60;
    const f=((t/chibi.duration(name))%1+1)%1;g.goToFrame(g.from+(g.to-g.from)*f);
    physics.enabled=true;physics.step(1/60);physics.enabled=false;
   }
   scene.render();
  },{name,phase});
  await page.screenshot({path:`artifacts/wells/coat-physics-${name}-${phase}.png`});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('artifacts/wells/coat-physics-validation.json',JSON.stringify({report,errors},null,2));
 console.log('PASS: 11 hem panels; walk/run at 30, 60 and 120 FPS; thigh contacts; finite normalized bones; teleport reset.');
} finally {await browser.close();}
