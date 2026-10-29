import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('artifacts/nayuta',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.NAYUTA_TEST_URL ?? 'http://127.0.0.1:5197'}/?run=test-range&character=nayuta&enemies=inactive`);
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const g=game,k=g.kit,V=g.player.position.constructor;
  g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();
  g.player.position.set(0,0,0);g.player.aim.set(0,.8,8);
  g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;
  g.run.critChance=0;g.run.burstAlwaysMax=false;g.run.burst=0;
  for(const t of g.targets.targets)t.alive=false;
  const cs=()=>g.targets.squad.filter(c=>c.name==='Nayuta (Clone)');
  const tap=()=>{k.useSpecial();k.chargeSpecial(.05,true,false);k.chargeSpecial(0,false,true);};
  const hold=()=>{k.useSpecial();k.chargeSpecial(.36,true,false);k.chargeSpecial(0,false,true);};
  const advance=t=>{for(let a=0;a<t;a+=.01)k.update(Math.min(.01,t-a));};
  k.useSpecial();const downCount=cs().length;k.chargeSpecial(0,false,true);
  tap();tap();const three={count:cs().length,charges:k.special().charges};
  tap();const exhausted=cs().length;advance(6.01);tap();const four=cs().length;
  const identities=cs().map(c=>c.model);tap();const sameAtCap=cs().every((c,i)=>c.model===identities[i]);
  const weak=cs()[1];weak.hp=1;weak.experience=12;g.player.hp=25;
  hold();const consumedWeak=!cs().includes(weak),afterHold=cs().length;
  advance(1);const maturedStatus=k.status,healed=g.player.hp;
  // Snapshot traveling returns while clones remain visibly spread around her.
  cs().forEach((c,i)=>c.position.set((i-1)*2,0,2));
  k.useBurst(g.player.position,0);k.update(.18);g.scene.render();
  window.reworkCapture={g,k,V,advance,tap,hold,cs};
  return {downCount,three,exhausted,four,sameAtCap,consumedWeak,afterHold,maturedStatus,healed,burstActive:k.burstActive,afterBurst:cs().length};
 });
 console.log(result);assert.equal(result.downCount,0);assert.deepEqual(result.three,{count:3,charges:0});assert.equal(result.exhausted,3);assert.equal(result.four,4);assert.ok(result.sameAtCap&&result.consumedWeak);assert.equal(result.afterHold,3);assert.match(result.maturedStatus,/INSIGHT 2.0/);assert.equal(result.healed,29);assert.ok(result.burstActive);assert.equal(result.afterBurst,0);
 await page.screenshot({path:'artifacts/nayuta/rework-return.png'});
 const combat=await page.evaluate(()=>{
  const {g,k,V,advance}=window.reworkCapture;
  advance(1.3);
  const targets=g.targets.targets.slice(0,5);
  [[0,6.5],[2,6.5],[0,-2],[0,14],[0,9]].forEach(([x,z],i)=>{const t=targets[i];t.alive=true;t.hp=10000;t.position.set(x,0,z);t.ward=null;t.marks.clear();t.breaks.clear();});
  const fire=()=>k.continueBurst();
  fire();const immediate=targets.map(t=>10000-t.hp);advance(.7);const echoes=targets.map(t=>10000-t.hp);
  fire();advance(.7);fire();k.update(.08);g.scene.render();
  window.reworkCapture.targets=targets;window.reworkCapture.fire=fire;
  return {immediate,echoes,finisher:10000-targets[4].hp,cooldown:k.weapon.cooldown,unlimited:k.unlimitedAmmo};
 });
 console.log(combat);assert.ok(combat.immediate[0]>0);assert.equal(combat.immediate[1],0);assert.equal(combat.immediate[2],0);assert.equal(combat.immediate[3],0);assert.equal(combat.immediate[4],0);assert.ok(combat.echoes[0]>combat.immediate[0]);assert.ok(combat.finisher>0);assert.equal(combat.cooldown,.08);assert.ok(combat.unlimited);
 await page.screenshot({path:'artifacts/nayuta/rework-palms.png'});
 const cleanup=await page.evaluate(()=>{
  const {g,k,advance,targets,fire,tap,hold,cs}=window.reworkCapture;
  advance(2);k.useBurst(g.player.position,0);advance(1.3);g.targets.navigation.traceCover=()=>0;const hp=targets[0].hp;fire();advance(.7);const cover=hp-targets[0].hp;
  g.targets.navigation.traceCover=()=>null;
  let blocked=0;g.targets.shieldContact=()=>({t:.1,shield:{block:()=>blocked++}});const hp2=targets[0].hp;fire();advance(.7);const shield=hp2-targets[0].hp;
  g.targets.shieldContact=()=>null;advance(13);const ended=!k.burstActive&&k.weapon.cooldown===.08;
  const before=targets[0].hp;k.useBurst(g.player.position,0);advance(1.3);fire();const emptyBurst=before-targets[0].hp;
  advance(13);for(const t of targets)t.alive=false;
  tap();const dead=cs()[0];dead.takeDamage(99999);advance(.1);const noDead=cs().length===0;
  k.dispose();return {cover,shield,blocked,ended,emptyBurst,noDead,squad:cs().length,glyphs:g.scene.meshes.filter(m=>m.name==='nayuta-ascetic-glyph').length};
 });
 console.log(cleanup);assert.equal(cleanup.cover,0);assert.equal(cleanup.shield,0);assert.ok(cleanup.blocked>0);assert.ok(cleanup.ended&&cleanup.emptyBurst>0&&cleanup.noDead);assert.equal(cleanup.squad,0);assert.equal(cleanup.glyphs,0);assert.deepEqual(errors,[]);
 await writeFile('artifacts/nayuta/rework-results.json',JSON.stringify({result,combat,cleanup,errors},null,2));
 console.log('PASS: tap/hold, charges, cap, weakest/mature return, narrow combo, echoes, cover/shields, zero-clone Burst and cleanup.');
} finally {await browser.close();}
