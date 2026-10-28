import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:5199/?run=test-range&zone=volcano_day&time=day');
 await page.waitForFunction(()=>window.game?.volcano&&game.scene.isReady(),null,{timeout:180000});
 const initial=await page.evaluate(()=>{
  const g=game;g.volcano.erupting=false;g.engine.stopRenderLoop();g.camera.update=()=>{};
  g.player.position.set(0,0,-9);
  return {textures:g.scene.textures.filter(t=>t.name.includes('caldera-v1')).map(t=>({name:t.name,ready:t.isReady()})),
    initialMeshes:g.scene.meshes.length,mountain:!!g.scene.getMeshByName('caldera-ridged-mountain'),
    borderEmbers:!!g.scene.getMeshByName('caldera-border-embers'),
    shaders:g.scene.materials.filter(m=>m.name.startsWith('caldera-')).map(m=>m.name)};
 });
 // The basin is ringed by a lava sea; there is no volcano cone any more.
 assert.ok(!initial.mountain);assert.ok(initial.borderEmbers);assert.ok(initial.textures.every(t=>t.ready));
 await fs.mkdir('artifacts/caldera',{recursive:true});
 async function capture(name,eye,target){
  await page.evaluate(({eye,target})=>{const g=game,c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));c.getViewMatrix(true);g.scene.render();},{eye,target});
  await page.waitForTimeout(200);await page.evaluate(()=>game.scene.render());await page.screenshot({path:`artifacts/caldera/${name}.png`});
 }
 await capture('final-field',[-18,17,-36],[-18,0,-17]);
 await capture('final-east-shore',[27,25,-30],[50,0,10]);
 await capture('final-west-wall',[-15,25,-14],[-55,9,0]);
 await capture('final-base',[20,24,-13],[48,1,12]);
 await capture('final-crater-bowl',[67,45,1],[78,25,18]);
 await page.evaluate(()=>{const g=game;g.volcano.spawnCrater(g.player.position.clone().set(-18,0,-17));});
 await page.waitForFunction(()=>game.scene.isReady());
 await capture('impact-hot',[-18,9,-26],[-18,0,-17]);
 const cooling=await page.evaluate(()=>{
  const g=game,v=g.volcano,c=v.craters.at(-1);v.update(10.5,g.player,g.targets,g.run,g.camera.focus,()=>{});
  const heat=c.material._floats.heat,age=c.age;return {heat,age,rim:c.rim.isEnabled()};
 });
 assert.ok(cooling.heat>0&&cooling.heat<1,'impact lava cools gradually');assert.ok(cooling.rim);
 await capture('impact-cooling',[-18,9,-26],[-18,0,-17]);
 const cold=await page.evaluate(()=>{
  const g=game,v=g.volcano;v.update(4,g.player,g.targets,g.run,g.camera.focus,()=>{});
  const c=v.craters.at(-1),before=v.craters.length;v.spawnCrater(c.at.clone());
  return {heat:c.material._floats.heat,count:v.craters.length,before,visibility:c.rim.visibility};
 });
 assert.equal(cold.heat,0);assert.equal(cold.count,cold.before);assert.equal(cold.visibility,1);
 await capture('impact-cold',[-18,9,-26],[-18,0,-17]);
 const crumble=await page.evaluate(()=>{
  const g=game,v=g.volcano;v.update(15,g.player,g.targets,g.run,g.camera.focus,()=>{});
  const c=v.craters.at(-1);return {progress:c.material._floats.crumble,minY:Math.min(...c.rim.getVerticesData('position').filter((_,i)=>i%3===1)),visibility:c.rim.visibility,floorMinY:Math.min(...c.disc.getVerticesData('position').filter((_,i)=>i%3===1)),floorVertices:c.disc.getTotalVertices()};
 });
 assert.ok(crumble.floorMinY<0);assert.ok(crumble.floorVertices>1000);
 assert.ok(crumble.progress>0&&crumble.progress<1);assert.ok(crumble.minY<0);assert.equal(crumble.visibility,1);
 await capture('impact-crumbling',[-18,9,-26],[-18,0,-17]);
 const collision=await page.evaluate(()=>{
  const nav=game.targets.navigation;
  // No volcano cone any more: nothing solid stands in the east lava.
  return {solid:nav.obstacles.some(o=>o.r>=30)};
 });
 assert.ok(!collision.solid);
 const cleared=await page.evaluate(()=>{
  const g=game,v=g.volcano;v.update(25,g.player,g.targets,g.run,g.camera.focus,()=>{});
  return {count:v.craters.length,rims:g.scene.meshes.filter(m=>m.name==='caldera-impact-rim').length,flameReady:v.flameTexture.isReady()};
 });
 assert.equal(cleared.count,0);assert.equal(cleared.rims,0);assert.ok(cleared.flameReady,'shared fire texture survives crater cleanup');
 const spacing=await page.evaluate(()=>{
  const g=game,v=g.volcano;v.volley(30,g.player,g.targets);
  const points=v.rocks.map(r=>r.to);let minimum=Infinity;
  for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z));
  return {count:points.length,minimum,elevatorSafe:points.every(p=>Math.max(Math.abs(p.x),Math.abs(p.z))>7.3)};
 });
 assert.ok(spacing.elevatorSafe);assert.ok(spacing.count>10);assert.ok(spacing.minimum>=5.7);
 const hazards=await page.evaluate(async()=>{
  const g=game,v=g.volcano;v.clear();v.erupting=false;v.nextThunder=100;
  const {inCalderaLava}=await import('/src/survivor/caldera-layout.ts');
  const at=g.player.position.clone().set(-52,0,0);
  const p={position:at,hp:100,maxHp:100,damageFlash:0,takeDamage(d){this.hp-=d;return true;}};
  const enemy={position:at.clone(),hp:200,maxHp:200,alive:true,radius:.5};
  v.update(.25,p,{targets:[enemy]}, {environmentDamage(t,d){t.hp-=d;}},at,()=>{});
  const damaged={playerHp:p.hp,enemyHp:enemy.hp};
  p.position.set(0,0,-12);enemy.position.copyFrom(p.position);
  v.update(.25,p,{targets:[enemy]}, {environmentDamage(t,d){t.hp-=d;}},p.position,()=>{});
  v.spawnCrater(at.clone().set(0,0,0));v.spawnCrater(at.clone().set(7,0,7));
  v.launch(at.clone().set(0,0,0),0);
  const wall=g.scene.getMeshByName('caldera-basalt-escarpment');
  return {damaged,dryPlayerHp:p.hp,dryEnemyHp:enemy.hp,blockedCraterCount:v.craters.length,blockedRockCount:v.rocks.length,
    deepLava:inCalderaLava(-52,0),eastLava:inCalderaLava(52,0),dry:inCalderaLava(0,-12),
    wallTriangles:wall.getTotalIndices()/3,moat:!!g.scene.getMeshByName('caldera-perimeter-lava')};
 });
 assert.equal(hazards.damaged.playerHp,80);assert.equal(hazards.damaged.enemyHp,160);
 assert.equal(hazards.dryPlayerHp,80);assert.equal(hazards.dryEnemyHp,160);
 assert.equal(hazards.blockedCraterCount,0);assert.equal(hazards.blockedRockCount,0);
 assert.ok(hazards.deepLava&&hazards.eastLava&&!hazards.dry);assert.ok(hazards.moat&&hazards.wallTriangles>1500);
 const switching=await page.evaluate(()=>{
  const g=game;g.setRangeEnvironment('forest');
  const off=!g.scene.getTransformNodeByName('volcano').isEnabled()&&!g.scene.getLightByName('volcano-summit').isEnabled()&&!g.atmosphere.volcanic;
  g.setRangeEnvironment('volcano');g.volcano.erupting=false;
  return {off,mountainCount:g.scene.meshes.filter(m=>m.name==='caldera-ridged-mountain').length,enabled:g.atmosphere.volcanic};
 });
 assert.ok(switching.off);assert.equal(switching.mountainCount,0);assert.ok(switching.enabled);
 await page.waitForFunction(()=>game.scene.isReady());await capture('final-overview',[-24,80,-80],[13,1,8]);
 assert.deepEqual(errors,[]);
 await fs.writeFile('artifacts/caldera/verification.json',JSON.stringify({initial,cooling,cold,crumble,collision,spacing,hazards,cleared,switching,errors},null,2));
 console.log('Caldera shader, texture, normals, cooling, cleanup, theme-switch checks passed.',{initial,cooling,cleared,switching});
}finally{await browser.close();}
