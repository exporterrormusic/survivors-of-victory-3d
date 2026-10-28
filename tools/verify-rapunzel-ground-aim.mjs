import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:5197/?run=test-range&character=rapunzel&enemies=inactive');await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 await page.evaluate(()=>{const g=game;g.player.ctx.teleport(g.player.position.clone().set(8,0,-8));g.camera.snap(g.player.position);for(const t of g.targets.targets)t.position.set(-20,0,20);const fire=g.kit.fire;g.kit.fire=(m,a,c)=>{window.clickedAim={x:a.x,y:a.y,z:a.z};fire(m,a,c);};});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const screen=await page.evaluate(()=>{const p=game.toScreen(9,0,-7),b=document.querySelector('canvas#game').getBoundingClientRect();return {x:p.x+b.x,y:p.y+b.y};});await page.mouse.click(screen.x,screen.y);await page.waitForFunction(()=>window.clickedAim);
 const aim=await page.evaluate(()=>window.clickedAim);console.log('close click',aim);assert.ok(Math.abs(aim.x-9)<.05&&Math.abs(aim.z+7)<.05&&Math.abs(aim.y)<.001);
 const result=await page.evaluate(()=>{
 const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();g.targets.navigation.setScenery([]);g.run.critChance=0;
 for(let i=0;i<120;i++){g.kit.update(1/60);g.vfx.update(1/60);}
 const impacts=[];const flash=g.vfx.flash.bind(g.vfx);g.vfx.flash=(at,...args)=>{impacts.push({x:at.x,z:at.z});flash(at,...args);};
 const p=g.player.position.clone().set(8,.7,-8),goal=p.clone().set(8,0,1),t=g.targets.targets[0];t.position.set(11.3,0,1);t.hp=1000;t.alive=true;
 g.kit.fire(p,goal);goal.set(-10,0,-10);g.player.aim.set(-10,0,-10);
 for(let i=0;i<60;i++){g.kit.update(1/60);g.vfx.update(1/60);}
 return {impacts,hp:t.hp};
 });console.log(result);assert.equal(result.impacts.length,1);assert.ok(Math.abs(result.impacts[0].x-8)<1e-5&&Math.abs(result.impacts[0].z-1)<1e-5);assert.equal(result.hp,985);
 console.log('PASS: screen click maps to ground, close endpoint retained, cursor movement and nearby enemies do not retarget, enlarged splash hits 3.3m offset target.');
}finally{await browser.close();}
