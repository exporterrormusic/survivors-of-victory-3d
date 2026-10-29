import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=dorothy&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
   const g=game;g.engine.setHardwareScalingLevel(2);g.engine.stopRenderLoop();
   g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
   const {Player}=await import('/src/survivor/player.ts');
   const {Run}=await import('/src/survivor/run.ts');
   const {createDorothy}=await import('/src/survivor/dorothy/index.ts');
   const V=g.player.position.constructor,run=new Run('dorothy');run.critChance=0;
   const origin=g.player.position.clone(),aim=origin.add(new V(0,0,10));
   g.kit.dispose();g.targets.navigation.setScenery([]);g.targets.navigation.traceCover=()=>null;g.targets.shieldContact=()=>null;
   for(const t of g.targets.targets)t.alive=false;
   let player;
   const ctx={scene:g.scene,shadows:g.targets.shadows,vfx:g.vfx,targets:g.targets,run,camera:g.camera,
     get playerPosition(){return player.position;},get hp(){return player.hp;},get aimPoint(){return player.aim;},get aimYaw(){return player.aimYaw;},
     muzzle:o=>player.rig.muzzle(o),heal(){},sound(){}};
   const kit=createDorothy(ctx);player=new Player(g.player.chibi,kit,ctx);player.position.copyFrom(origin);player.aim.copyFrom(aim);
   await kit.prepare();
   const target=g.targets.targets[0];target.alive=true;target.hp=1000;target.position.copyFrom(origin).addInPlace(new V(0,0,9));target.marks.clear();target.breaks.clear();target.ward=null;
   const input={wasPressed:()=>false,wasReleased:()=>false,isHeld:a=>a==='fire',move:()=>[0,0]};
   kit.useSpecial();const flightHp=player.hp;
   if(player.takeDamage(10)||player.takeDamage(10,true)||player.hp!==flightHp)throw new Error('Flight immunity failed');
   let lift=0;
   for(let i=0;i<40;i++){player.update(.02,input,aim);kit.update(.02);player.afterAnimation();lift=Math.max(lift,kit.presentationLift);if(!kit.invulnerable)break;}
   const distance=V.Distance(origin,player.position),ammo=player.ammo,damage=1000-target.hp;
   if(!player.takeDamage(1,true))throw new Error('Flight immunity persisted after landing');
   // Terrain still governs the ability's movement, even though enemy separation is bypassed.
   kit.update(8);const before=player.position.clone(),push=g.targets.navigation.push;
   g.targets.navigation.push=()=>{};aim.z+=10;player.aim.copyFrom(aim);kit.useSpecial();
   for(let i=0;i<40;i++){player.update(.02,{...input,isHeld:()=>false},aim);kit.update(.02);}
   const blockedDistance=V.Distance(before,player.position);g.targets.navigation.push=push;
   kit.useBurst(player.position,0);kit.update(.25);player.afterAnimation();g.scene.render();
   const root=g.scene.getTransformNodeByName('dorothy-deployed-armor');
   const armorBones=player.chibi.animationGroup('cover_aim_idle').targetedAnimations.filter(t=>/^(Bone_Skirt_Wing|Bone022)/.test(t.target.name)&&t.animation.targetProperty==='scaling');
   kit.update(9);player.afterAnimation();
   const idle=player.chibi.animationGroup('idle_01');
   const retracted=armorBones.every(t=>{const rest=idle.targetedAnimations.find(a=>a.target===t.target&&a.animation.targetProperty==='scaling');return !rest||V.Distance(t.target.scaling,rest.animation.evaluate(idle.from))<.001;});
   if(!retracted)throw new Error('Native armor did not retract');
   kit.useBurst(player.position,0);kit.update(.25);player.afterAnimation();
   const deployed=armorBones.some(t=>t.target.scaling.length()>.5),plates=root?.getChildMeshes().length??0;
   if(!armorBones.length)throw new Error('Native armor bones not found');
   // Real Player death and training respawn must clear the form immediately.
   player.takeDamage(100000,true);
   if(kit.burstActive||kit.throughEnemies)throw new Error('Death retained ability state');
   player.update(2.1,{...input,isHeld:()=>false},aim);kit.update(.02);player.afterAnimation();
   if(player.hp<=0||kit.burstActive)throw new Error('Respawn retained Burst');
   for(const t of armorBones){const rest=idle.targetedAnimations.find(a=>a.target===t.target&&a.animation.targetProperty==='scaling');if(rest&&V.Distance(t.target.scaling,rest.animation.evaluate(idle.from))>.001)throw new Error('Respawn armor mismatch');}
   kit.useBurst(player.position,0);kit.update(.25);player.afterAnimation();
   // Inspect the deployed rig unobstructed, with the same materials and lighting as play.
   const keep=new Set([...player.chibi.meshes,...(root?.getChildMeshes()??[])]);
   for(const mesh of g.scene.meshes)if(!keep.has(mesh))mesh.isVisible=false;
   aim.copyFrom(player.position).addInPlace(new V(0,0,-10));
   for(let i=0;i<3;i++){player.update(.1,{...input,isHeld:()=>false},aim);kit.update(.1);g.scene.render();player.afterAnimation();}
   g.camera.camera.position.copyFrom(player.position).addInPlace(new V(0,4,-8));
   g.camera.camera.setTarget(player.position.add(new V(0,1.2,0)));g.scene.render();player.afterAnimation();
   // Keep the actual current HUD and custom art in the capture.
   document.querySelector('.rb-name').textContent='PARADISE LOST';
   document.querySelector('.rb-text b').textContent=kit.burstLabel;
   window.dorothyKitReview={kit,player,ctx};
   return {distance,ammo,damage,lift,blockedDistance,deployed,plates,burst:kit.burstActive};
 });
 assert.ok(Math.abs(result.distance-10)<.05);assert.ok(result.ammo<60);assert.ok(result.damage>=9);assert.ok(result.lift>.75);
 assert.equal(result.blockedDistance,0);assert.ok(result.deployed&&result.plates===0&&result.burst);
 await page.screenshot({path:'artifacts/dorothy/paradise-lost.png',timeout:20000});
 assert.deepEqual(errors,[]);await writeFile('artifacts/dorothy/kit-verification.json',JSON.stringify({...result,errors},null,2));
 console.log(result);
}finally{await browser.close();}
