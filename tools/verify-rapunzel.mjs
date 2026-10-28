import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5196/?run=test-range&character=rapunzel&enemies=inactive',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await fs.mkdir('artifacts/rapunzel',{recursive:true});
 await page.screenshot({path:'artifacts/rapunzel/base.png'});
 const result=await page.evaluate(()=>{
  const g=game;g.scene.onBeforeRenderObservable.clear();g.scene.onAfterAnimationsObservable.clear();
  g.targets.navigation.setScenery([]);g.snow.field.enabled=false;
  const p=g.player.position.clone().set(0,0,-8); g.player.ctx.teleport(p);g.camera.snap(p);
  g.player.aim.set(0,.7,-3);g.run.critChance=0;g.run.burstAlwaysMax=false;g.run.burst=0;
  for(const t of g.targets.targets){t.position.set(22,0,22);t.alive=true;t.hp=1000;t.stunned=0;}
  const t=g.targets.targets[0];t.position.set(0,0,-3);t.hp=1000;
  g.kit.fire(p.add(p.clone().set(0,.7,0)),g.player.aim);
  for(let i=0;i<120;i++)g.kit.update(1/60);
  const rocketDamage=1000-t.hp, gauge=g.run.burst;
  g.player.hp=10;const cast=g.kit.useSpecial(),blocked=!g.kit.useSpecial();g.kit.update(1);
  const healing=g.player.hp;
  g.player.ctx.teleport(p.add(p.clone().set(12,0,0)));g.kit.update(1);const outside=g.player.hp;
  const boss=g.targets.targets[1];boss.combatTier='boss';boss.stunned=0;
  g.kit.useBurst(g.player.position,0);const burstHeal=g.player.hp,stun=t.stunned,bossStun=boss.stunned;
  for(const track of ['attack','skill','burst'])for(let rank=2;rank<=5;rank++)assertPurchase(g.run.talents.purchase(track,rank,g.run));
  function assertPurchase(ok){if(!ok)throw Error('purchase failed');}
  g.player.ctx.teleport(p);g.kit.update(10);g.player.hp=10;
  g.kit.useSpecial();g.kit.update(1);const poweredHeal=g.player.hp;
  t.position.set(0,0,-3);t.hp=1000;t.marks.clear();
  g.kit.fire(p.add(p.clone().set(0,.7,0)),g.player.aim);
  for(let i=0;i<120;i++)g.kit.update(1/60);
  const marked=t.marks.has('rapunzel-armor'),burning=g.run.isBurning(t,'rapunzel-burn');
  const zoom=g.camera.distance;g.kit.useBurst(g.player.position,0,1);
  const launchers=g.scene.transformNodes.filter(n=>n.name==='sw-turret'&&n.isEnabled()).length;
  const zoomOut=g.camera.distance;
  for(let i=0;i<1100;i++){g.kit.update(1/60);g.run.update(1/60);g.vfx.update(1/60);}
  return {rocketDamage,gauge,cast,blocked,healing,outside,burstHeal,stun,bossStun,poweredHeal,marked,burning,launchers,zoom,zoomOut,zoomRestored:g.camera.distance,sp:g.run.skillPoints};
 });
 console.log(result);
 assert.equal(result.rocketDamage,15);assert.equal(result.gauge,10);assert.equal(result.cast,true);assert.equal(result.blocked,true);
 assert.equal(result.healing,11.5);assert.equal(result.outside,11.5);assert.equal(result.burstHeal,50);assert.equal(result.stun,4);assert.equal(result.bossStun,0);
 assert.equal(result.poweredHeal,18.75);assert.equal(result.marked,true);assert.equal(result.burning,true);assert.equal(result.launchers,10);
 assert.ok(result.zoomOut>result.zoom);assert.equal(result.zoomRestored,result.zoom);assert.equal(result.sp,0);
 await page.evaluate(()=>{game.talentMenu.open();});
 await page.screenshot({path:'artifacts/rapunzel/talents.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: rocket splash, gauge, healing area/cooldown, full-heal Burst, boss immunity, ordered ranks, armor mark/burn, ten launchers and camera restoration.');
} finally { await browser.close(); }
