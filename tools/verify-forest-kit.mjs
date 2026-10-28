import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:5199/tools/review/forest-kit-review.html');
  await page.waitForFunction(()=>window.forestKit?.scene.isReady(),null,{timeout:120000});
  await page.waitForTimeout(1500);
  const well=await page.evaluate(()=>{
    const {scene}=forestKit,root=scene.getTransformNodeByName('forest-well');
    return {emissive:root.getChildMeshes().some(m=>m.material.emissiveColor.asArray().some(v=>v>0)),
      triangles:root.getChildMeshes().reduce((s,m)=>s+m.getTotalIndices()/3,0),
      textures:scene.textures.every(t=>t.isReady()),
      water:scene.getMeshByName('forest-well-forest-water').getBoundingInfo().boundingBox.maximumWorld.y};
  });
  assert.equal(well.emissive,false,'well must not emit ghost light');assert.ok(well.water<.2,'water below coping');assert.ok(well.textures);
  await page.screenshot({path:'artifacts/forest-well-v2.png'});
  await page.evaluate(()=>{forestKit.camera.beta=.48;forestKit.camera.radius=5.5;});await page.waitForTimeout(300);
  await page.screenshot({path:'artifacts/forest-well-v2-opening.png'});
  await page.evaluate(()=>{forestKit.show('all');forestKit.camera.beta=.85;});await page.waitForTimeout(1000);
  await page.screenshot({path:'artifacts/forest-decorations-v2.png'});
  await page.evaluate(()=>{forestKit.show('forest-cabin');forestKit.camera.alpha=-1.05;forestKit.camera.beta=1.1;});await page.waitForTimeout(700);
  await page.screenshot({path:'artifacts/forest-cabin-v2.png'});
  const cabin=await page.evaluate(async()=>{
    const {Ray,Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
    const root=forestKit.scene.getTransformNodeByName('forest-cabin');
    const door=new Ray(new Vector3(0,1,-4),new Vector3(0,0,1),5);
    return {doorBlocked:root.getChildMeshes().some(m=>{m.computeWorldMatrix(true);return door.intersectsMesh(m).hit;}),
      triangles:root.getChildMeshes().reduce((n,m)=>n+m.getTotalIndices()/3,0)};
  });
  assert.equal(cabin.doorBlocked,false,'visible doorway must be physically open');
  await page.goto('http://127.0.0.1:5199/?run=test-range&environment=forest&enemies=inactive');
  await page.waitForFunction(()=>window.game?.scene,null,{timeout:180000});
  await page.evaluate(()=>game.setRangeEnvironment('forest'));
  await page.waitForFunction(()=>game.scene.isReady()&&game.scene.materials.some(m=>m.name==='forest-water'),null,{timeout:180000});
  await page.evaluate(()=>{game.player.position.set(40,0,-10);game.camera.setDistance(9);game.camera.snap(game.player.position);});
  await page.waitForTimeout(1800);await page.screenshot({path:'artifacts/forest-well-v2-in-game.png'});
  const navigation=await page.evaluate(()=>{
    const nav=game.targets.navigation;
    const enter=nav.clear({x:48,z:4},{x:53,z:4},.45);
    const wall=nav.clear({x:48,z:2},{x:53,z:2},.45);
    game.player.position.set(52,0,4);game.player.unstick();
    game.camera.setDistance(10);game.camera.snap(game.player.position);
    return {enter,wall,position:{x:game.player.position.x,z:game.player.position.z}};
  });
  assert.ok(navigation.enter,'cabin entrance is navigable');assert.equal(navigation.wall,false,'front wall still blocks movement');
  assert.ok(Math.hypot(navigation.position.x-52,navigation.position.z-4)<.01,'interior is valid player ground');
  await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/forest-cabin-v2-interior.png'});
  assert.deepEqual(errors,[]);console.log('Forest kit loaded without browser errors:',{well,cabin,navigation});
} finally {await browser.close();}
