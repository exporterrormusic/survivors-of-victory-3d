import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('BROWSER',m.text().slice(0,500));}});
 await page.goto('http://127.0.0.1:5198/?run=test-range&character=nayuta&enemies=inactive');await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 console.log('Scene ready');
 const setup=await page.evaluate(async()=>{
  const g=game,k=g.kit;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  const {Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
  const {audioEngine}=await import('/src/audio/audio-engine.ts');const sounds=[];audioEngine.play=c=>sounds.push(c.url);
  g.player.aim.set(0,.8,20);g.run.burstAlwaysMax=false;g.run.burst=100;g.run.critChance=0;
  g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;for(const t of g.targets.targets)t.alive=false;
  g.scene.onAfterAnimationsObservable.add(()=>{g.player.afterAnimation();g.vfx.update(0);});
  const step=dt=>{g.player.update(dt,g.input,g.player.aim);k.update(dt);g.vfx.update(dt);g.scene.render();g.input.endFrame();};
  const advance=t=>{for(let i=0;i<t;i+=.05){const dt=Math.min(.05,t-i);k.update(dt);g.vfx.update(dt);}g.player.update(0,g.input,g.player.aim);g.scene.render();g.input.endFrame();};
  const tap=()=>{k.useSpecial();k.chargeSpecial(0,false,true);},cs=()=>g.targets.squad.filter(c=>c.name==='Nayuta (Clone)');
  k.useSpecial();const noEarly=cs().length===0;k.chargeSpecial(0,false,true);tap();tap();const stored={count:cs().length,charges:k.special().charges};
  const dead=cs()[0];dead.takeDamage(99999);step(.01);const fadeStart=dead.model.root.isEnabled();step(.15);const fadeMid=dead.model.meshes[0].visibility;step(.2);const fadeEnd=!dead.model.root.isEnabled();
  const weak=cs()[0];weak.hp=1;weak.experience=12;g.player.hp=25;k.useSpecial();k.chargeSpecial(.36,true,false);k.chargeSpecial(0,false,true);advance(1.4);
  const reward={health:g.player.hp,status:k.status};
  g.run.talents.addSource({has:id=>id==='army_of_me'||id==='twin_self'});
  for(let i=0;i<5;i++){advance(6.1);tap();}const cap=cs().length;
  const initialModel=g.player.chibi,initialSkin=initialModel.meta.variant,saved=JSON.stringify(localStorage);
  const targets=g.targets.targets.slice(0,5);[[0,9],[4,9],[0,-2],[0,20],[0,14]].forEach(([x,z],i)=>{const t=targets[i];t.alive=true;t.hp=100000;t.position.set(x,0,z);t.ward=null;t.marks.clear();t.breaks.clear();});
  g.input.trigger('burst');step(.01);advance(.59);const midpoint=k.presentationLift;advance(.7);
  const root=initialModel.root,hip=initialModel.joint('Bip001 Pelvis'),left=initialModel.joint('Bip001 L Foot'),right=initialModel.joint('Bip001 R Foot');
  const drop=hip.getAbsolutePosition().y-(left.getAbsolutePosition().y+right.getAbsolutePosition().y)/2;
  window.finalNayuta={g,k,step,advance,tap,cs,targets,sounds,initialModel,initialSkin,saved,Vector3};
  return{noEarly,stored,fadeStart,fadeMid,fadeEnd,reward,cap,midpoint,lift:k.presentationLift,drop,sameModel:g.player.chibi===initialModel,active:k.burstActive,clones:cs().length,gauge:g.run.burst};
 });console.log(setup);assert.ok(setup.noEarly&&setup.fadeStart&&setup.fadeEnd);assert.deepEqual(setup.stored,{count:3,charges:0});assert.ok(setup.fadeMid>0&&setup.fadeMid<.65);assert.equal(setup.reward.health,29);assert.match(setup.reward.status,/INSIGHT 2.0/);assert.equal(setup.cap,8);assert.ok(setup.midpoint>.3&&setup.midpoint<.7);assert.ok(setup.drop<.35);assert.ok(setup.sameModel&&setup.active);assert.equal(setup.clones,0);assert.equal(setup.gauge,0);
 await page.screenshot({path:'artifacts/nayuta/final-gold-form.png'});
 const combat=await page.evaluate(()=>{
  const {g,k,step,advance,targets,Vector3}=window.finalNayuta;
  // Mix LMB, E, LMB through one combo without spending another Burst gauge.
  const before=targets.map(t=>t.hp);g.input.trigger('fire');step(.01);const primary=k.burstLabel;
  const first=targets.map((t,i)=>before[i]-t.hp);advance(.4);
  const before2=targets[0].hp;g.input.trigger('burst');step(.01);advance(.3);const second=before2-targets[0].hp;advance(.7);
  g.input.trigger('fire');step(.01);step(.2);
  const fist=g.scene.meshes.filter(m=>m.name==='nayuta-ascetic-glyph'&&m.isEnabled());
  let minY=Infinity;for(const m of fist){const p=m.getVerticesData('position');for(let i=0;i<p.length;i+=3)minY=Math.min(minY,Vector3.TransformCoordinates(new Vector3(p[i],p[i+1],p[i+2]),m.computeWorldMatrix(true)).y);}
  return{primary,first,second,finisher:before[4]-targets[4].hp,label:k.burstLabel,minY,texture:fist[0].material.getActiveTextures()[0].url};
 });console.log(combat);assert.match(combat.primary,/2\/3/);assert.ok(combat.first[0]>0&&combat.second>0);assert.equal(combat.first[1],0);assert.equal(combat.first[2],0);assert.equal(combat.first[3],0);assert.equal(combat.first[4],0);assert.ok(combat.finisher>0);assert.equal(combat.label,'FINAL PALM');assert.ok(combat.minY>=0);assert.match(combat.texture,/holy-open-palm/);
 await page.screenshot({path:'artifacts/nayuta/final-anime-fist.png'});
 const finish=await page.evaluate(()=>{
  const {g,k,step,advance,initialModel,initialSkin,saved,sounds,tap,cs}=window.finalNayuta;
  advance(2);const restored={same:g.player.chibi===initialModel,skin:g.player.chibi.meta.variant,lift:k.presentationLift,active:k.burstActive,saved:JSON.stringify(localStorage)===saved,gauge:g.run.burst};
  // Fog readability uses the same depth-independent batch as world-space status indicators.
  for(const t of g.targets.targets)t.alive=false;tap();tap();cs().forEach((c,i)=>c.position.copyFrom(g.player.position).addInPlaceFromFloats((i-1)*4,0,3));
  g.atmosphere.set('night','fog',true);g.atmosphere.setIntensity('moderate');g.atmosphere.update(1,g.player.position,true);
  k.useSpecial();k.chargeSpecial(.36,true,false);k.chargeSpecial(0,false,true);step(.7);
  return{restored,initialSkin,particles:g.vfx.quads.filter(q=>q.busy&&q.onTop&&q.visible).length,sounds:[...new Set(sounds)]};
 });console.log(finish);assert.ok(finish.restored.same&&finish.restored.saved&&!finish.restored.active);assert.equal(finish.restored.skin,finish.initialSkin);assert.equal(finish.restored.lift,0);assert.equal(finish.restored.gauge,0);assert.ok(finish.particles>=104);assert.ok(finish.sounds.some(s=>s.endsWith('nayuta-palm.wav')));assert.ok(finish.sounds.some(s=>s.endsWith('nayuta-palm-final.wav')));assert.ok(!finish.sounds.some(s=>s.includes('fire-sword')));
 await page.screenshot({path:'artifacts/nayuta/final-fog-return.png'});
 await page.setViewportSize({width:768,height:900});const placement=await page.evaluate(()=>{game.scene.render();const a=document.querySelector('.run-kit-status').getBoundingClientRect(),b=document.querySelector('[data-slot="special"]').getBoundingClientRect();return{gap:b.top-a.bottom,offset:Math.abs(a.x+a.width/2-b.x-b.width/2)};});assert.ok(placement.gap>0&&placement.offset<1);
 await page.evaluate(()=>{game.kit.dispose();});assert.deepEqual(errors,[]);
 await writeFile('artifacts/nayuta/final-results.json',JSON.stringify({setup,combat,finish,placement,errors},null,2));console.log('PASS: clone cycle, dissolution, same-model meditation, mixed LMB/E punches/ranges, illustrated upright fists/ground clearance, local audio, fog and HUD.');
}finally{await browser.close();}
