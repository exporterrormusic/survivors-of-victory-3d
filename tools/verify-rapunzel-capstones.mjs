import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5196/?run=test-range&character=rapunzel&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const {Run}=await import('/src/survivor/run.ts');
  const {createRapunzel}=await import('/src/survivor/rapunzel/index.ts');
  const g=game,ctx=g.player.ctx;
  g.scene.onBeforeRenderObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  g.targets.navigation.setScenery([]);
  const point=(x,z,y=0)=>g.player.position.clone().set(x,y,z);
  const t=g.targets.targets[0];
  const reset=()=>{ctx.teleport(point(0,-8));for(const e of g.targets.targets){e.position.set(20,0,20);e.hp=10000;e.alive=true;e.marks.clear();}t.position.set(0,0,-3);};
  function setup(capstone){
   localStorage.setItem('nikke-moba.rapunzel-capstone',capstone);
   const run=new Run('rapunzel');run.skillPoints=30;run.critChance=0;
   const base=Object.create(ctx);Object.defineProperty(base,'run',{value:run});
   const kit=createRapunzel(base);
   const locked=!run.talents.has(capstone==='attack'?'endless_desire':capstone==='skill'?'all_the_toys':'goddess_no_yield');
   for(const track of ['attack','skill','burst'])for(let rank=2;rank<=5;rank++)run.talents.purchase(track,rank,run);
   return {run,kit,locked};
  }
  reset();const a=setup('attack');a.kit.fire(point(0,-8,.7),point(0,-3,.7));
  for(let i=0;i<240;i++){a.kit.update(1/60);a.run.update(1/60);}
  const burn1=a.run.burns.get(t)?.get('rapunzel-endless')?.dps;
  t.position.set(15,0,0);for(let i=0;i<600;i++){a.kit.update(1/60);a.run.update(1/60);}
  const permanent=a.run.isBurning(t,'rapunzel-endless');
  t.generation++;a.run.update(.5);const respawnClean=!a.run.isBurning(t);
  reset();const s=setup('skill');g.player.hp=1;s.kit.update(.1);s.kit.useSpecial();s.kit.update(1);
  const doubleHeal=g.player.hp;
  const b=setup('burst');const random=Math.random;
  const refunds=[.1,.3,.9].map(value=>{Math.random=()=>value;b.run.burst=100;b.run.spendBurst();return b.run.burst;});Math.random=random;
  // A tall wall must stop the projectile and its splash before reaching this target.
  reset();g.targets.navigation.setScenery([{x:0,z:-5,r:1,height:4}]);
  const freshRun=new Run('rapunzel');freshRun.critChance=0;
  const c=Object.create(ctx);Object.defineProperty(c,'run',{value:freshRun});const k=createRapunzel(c);
  k.fire(point(0,-8,.7),point(0,-3,.7));for(let i=0;i<180;i++)k.update(1/60);
  const coveredHp=t.hp;
  g.targets.navigation.setScenery([]);k.fire(point(0,-8,.7),point(0,-3,.7));for(let i=0;i<180;i++)k.update(1/60);
  const openHp=t.hp;
  localStorage.removeItem('nikke-moba.rapunzel-capstone');
  return {locked:a.locked&&s.locked&&b.locked,burn1,permanent,respawnClean,doubleHeal,refunds,coveredHp,openHp};
 });
 console.log(result);assert.equal(result.locked,true);assert.ok(result.burn1>=24);assert.equal(result.permanent,true);assert.equal(result.respawnClean,true);
 assert.ok(Math.abs(result.doubleHeal-19.375)<.001);assert.deepEqual(result.refunds,[100,50,0]);assert.equal(result.coveredHp,10000);assert.equal(result.openHp,9985);assert.deepEqual(errors,[]);
 console.log('PASS: gated capstones, stacking persistent burn, respawn cleanup, concurrent healing auras, gauge refund branches and projectile/blast cover.');
}finally{await browser.close();}
