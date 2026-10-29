import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/nayuta', {recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error') console.log('BROWSER',m.text().slice(0,300));});
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const g=window.game;g.engine.setHardwareScalingLevel(3);g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  const V=g.player.position.constructor;
  g.player.position.set(0,0,0);g.player.unstick();
  const kit=g.kit, run=g.run;
  const first=kit.useSpecial();kit.chargeSpecial(0,false,true);const blocked=kit.special().charges===2;
  for(let i=0;i<5;i++){kit.update(8);kit.useSpecial();kit.chargeSpecial(0,false,true);}
  const clones=g.targets.squad.filter(c=>c.name==='Nayuta (Clone)');
  const capped=clones.length;
  clones[0].takeDamage(100000);kit.update(.01);
  const afterDeath=g.targets.squad.filter(c=>c.name==='Nayuta (Clone)').length;
  for(const c of g.targets.squad) c.takeDamage(100000);kit.update(.01);
  // Isolate one target and a short unobstructed bullet path.
  const target=g.targets.targets[0];
  for(const t of g.targets.targets)t.alive=false;
  target.alive=true;target.hp=100;target.position.set(0,0,3);target.marks.clear();target.breaks.clear();target.ward=null;
  const savedTrace=g.targets.navigation.traceCover;g.targets.navigation.traceCover=()=>null;
  const savedShield=g.targets.shieldContact;g.targets.shieldContact=()=>null;
  run.critChance=0;run.burst=0;run.burstAlwaysMax=false;g.player.aim.set(0,.7,5);
  kit.fire(new V(0,.7,0),new V(0,.7,5));for(let i=0;i<50;i++)kit.update(.01);
  const shotDamage=100-target.hp,gauge=run.burst;
  const victim=g.targets.targets[1];victim.alive=true;victim.hp=100;victim.position.set(0,0,5);
  target.hp=100;
  g.targets.navigation.traceCover=()=>0;
  kit.fire(new V(0,.7,0),new V(0,.7,5));for(let i=0;i<50;i++)kit.update(.01);
  const coveredDamage=100-target.hp;
  g.targets.navigation.traceCover=savedTrace;g.targets.shieldContact=savedShield;
  for(const t of g.targets.targets)t.alive=false;
  kit.update(8);kit.useSpecial();kit.chargeSpecial(0,false,true);kit.update(.01);
  g.scene.render();
  return {character:run.characterId,first,blocked,capped,afterDeath,shotDamage,gauge,coveredDamage,tiers:run.tiers.tiers.map(t=>t.level)};
 });
 console.log(result);
 assert.equal(result.character,'nayuta');assert.ok(result.first&&result.blocked);assert.equal(result.capped,4);assert.equal(result.afterDeath,3);assert.equal(result.shotDamage,4);assert.equal(result.coveredDamage,0);assert.ok(result.gauge>0);
 assert.deepEqual(result.tiers,[1,4,7,10,13,16,20]);
 await page.screenshot({path:'artifacts/nayuta/base.png'});
 await page.evaluate(()=>localStorage.setItem('nikke-moba.roster-v1',JSON.stringify({ownedSkinIds:['c223_01'],equippedSkins:{nayuta:'c223_01'}})));
 await page.reload();await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const skin=await page.evaluate(()=>game.player.chibi.meta.variant);assert.equal(skin,'c223_01');
 await page.screenshot({path:'artifacts/nayuta/wu-wei.png'});
 const advanced=await page.evaluate(async()=>{
   const {Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
   const g=game;g.engine.setHardwareScalingLevel(3);g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
   const playerMeshes=new Set(g.player.chibi.meshes);
   for(const mesh of g.scene.meshes)if(!playerMeshes.has(mesh))mesh.isVisible=false;
   const errors=[];
   for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const posture of ['aim','shot','reload'])for(const moving of [false,true]){
     for(let i=0;i<3;i++){g.player.rig.update(.2,{moveX:moving?Math.sin(yaw):0,moveZ:moving?Math.cos(yaw):0,speed:moving?5:0,aimYaw:yaw,posture});g.scene.render();g.player.rig.applyAim();}
     const head=g.player.chibi.joint('Bip001 Head'),f=Vector3.TransformNormal(new Vector3(0,1,0),head.computeWorldMatrix(true));
     const a=Math.atan2(f.x,f.z)-yaw;errors.push(Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))*180/Math.PI);
   }
   const run=g.run,kit=g.kit;
   for(const t of g.targets.targets)t.alive=false;
   const target=g.targets.targets[0];target.alive=true;target.hp=100;target.ward=null;target.marks.clear();target.breaks.clear();
   target.position.copyFrom(g.player.position).addInPlace(new Vector3(0,0,2));
   g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;
   g.scene.render();kit.useBurst(g.player.position,0);kit.update(1.3);kit.continueBurst();const burstDamage=100-target.hp;
   // Follow the clone branch through every tier, then exercise the raised cap and cleanup.
   for(const [tier,option] of [[0,1],[1,1],[2,1],[3,0],[4,1],[5,0],[6,0]])run.tiers.choose(tier,option,20);
   target.alive=false;
   for(let i=0;i<5;i++){kit.update(8);kit.useSpecial();kit.chargeSpecial(0,false,true);}
   const clones=g.targets.squad.filter(c=>c.name==='Nayuta (Clone)');
   const cap=clones.length,cloneHp=clones[0].maxHp,cloneSkin=clones[0].model.meta.variant;
   // Clones really deal damage, not just play muzzle flashes.
   target.position.copyFrom(clones[0].position).addInPlace(new Vector3(0,0,2));target.alive=true;target.hp=1000;
   for(let i=0;i<100;i++)kit.update(.01);
   const cloneDamage=1000-target.hp;
   kit.dispose();const remaining=g.targets.squad.filter(c=>c.name==='Nayuta (Clone)').length;
   return {facingError:Math.max(...errors),burstDamage,cap,cloneHp,cloneSkin,cloneDamage,remaining};
 });
 console.log(advanced);assert.ok(advanced.facingError<1);assert.equal(advanced.burstDamage,60);assert.equal(advanced.cap,8);assert.equal(advanced.cloneHp,100);assert.equal(advanced.cloneSkin,'c223_01');assert.ok(advanced.cloneDamage>0);assert.equal(advanced.remaining,0);
 assert.deepEqual(errors,[]);
 console.log('PASS: base/Wu Wei loading, clone cap/cooldown/death, damage/gauge, cover and tiers.');
} finally {await browser.close();}
