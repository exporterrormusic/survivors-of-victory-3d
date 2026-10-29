import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const form=await page.evaluate(()=>{
  const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  for(const t of g.targets.targets)t.alive=false;
  g.player.aim.set(0,0,-20);g.kit.useBurst(g.player.position,Math.PI);
  g.kit.update(.6);const midway={base:1-g.kit.presentationLift/.95,lift:g.kit.presentationLift};
  for(let i=0;i<70;i++)g.kit.update(.01);g.player.afterAnimation();g.vfx.update(.01);g.scene.render();
  const root=g.player.chibi.root;
  const bones=g.scene.transformNodes.filter(n=>n.isDescendantOf(root)&&/Thigh|Calf|Foot/.test(n.name));
  const before=bones.map(n=>Array.from(n.rotationQuaternion?.asArray()??[]));
  g.kit.continueBurst();g.kit.update(.7);g.scene.render();
  const after=bones.map(n=>Array.from(n.rotationQuaternion?.asArray()??[]));
  const delta=Math.max(...before.flatMap((b,i)=>b.map((v,j)=>Math.abs(v-after[i][j]))));
  window.holyReview={g,bones};return{midway,delta,bones:bones.length};
 });console.log(form);assert.ok(form.midway.base>.3&&form.midway.base<.7);assert.ok(form.midway.lift>.3&&form.midway.lift<.7);assert.ok(form.bones>=6);assert.ok(form.delta<.0001);
 await page.screenshot({path:'artifacts/nayuta/meditation-front.png'});
 const stream=await page.evaluate(()=>{
  const {g}=window.holyReview;g.kit.update(15);for(let i=0;i<3;i++){g.kit.useSpecial();g.kit.chargeSpecial(0,false,true);}
  const clones=g.targets.squad.filter(c=>c.name==='Nayuta (Clone)');clones.forEach((c,i)=>c.position.copyFrom(g.player.position).addInPlaceFromFloats((i-1)*4,0,3));
  g.atmosphere.set('night','fog',true);g.atmosphere.setIntensity('moderate');g.atmosphere.update(1,g.player.position,true);
  g.kit.useSpecial();g.kit.chargeSpecial(.36,true,false);g.kit.chargeSpecial(0,false,true);
  g.kit.update(.7);g.player.afterAnimation();g.vfx.update(.01);g.scene.render();
  const top=g.vfx.quads.filter(q=>q.busy&&q.onTop&&q.visible);return{count:top.length,maxWidth:Math.max(...top.map(q=>q.scaling.y))};
 });console.log(stream);assert.ok(stream.count>=104);assert.ok(stream.maxWidth>=.4);
 await page.screenshot({path:'artifacts/nayuta/return-heavy-fog.png'});
 assert.deepEqual(errors,[]);console.log('PASS: gradual transformation, locked meditation legs, thick 104-quad return stream above fog.');
}finally{await browser.close();}

