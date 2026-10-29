import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
   const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();
   const {audioEngine}=await import('/src/audio/audio-engine.ts');
   const {WEAPON_FIRE}=await import('/src/audio/sound-bank.ts');
   audioEngine.stopMusic();audioEngine.preload([WEAPON_FIRE.smg.url]);
   const decoded=await audioEngine.buffers.get(WEAPON_FIRE.smg.url),context=audioEngine.graph.context;
   await context.resume();
   let starts=0;const create=context.createBufferSource.bind(context);
   context.createBufferSource=()=>{const source=create(),start=source.start.bind(source);source.start=(...args)=>{starts++;start(...args);};return source;};
   for(let i=0;i<30;i++){audioEngine.play(WEAPON_FIRE.smg);await new Promise(r=>setTimeout(r,80));}
   await new Promise(r=>setTimeout(r,200));
   context.createBufferSource=create;
   const playing=audioEngine.activity.get(WEAPON_FIRE.smg).playing;
   const {Vector3}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
   const {nirvanaBolt,nirvanaMuzzle,nirvanaImpact}=await import('/src/survivor/nayuta/smg-effects.ts');
   g.vfx.update(10);const baseline=g.vfx.quads.filter(q=>q.busy).length;
   const origin=g.player.position.add(new Vector3(0,.7,0));
   const direction=new Vector3(1,0,.55).normalize(),bolts=[];
   for(let i=0;i<5;i++)for(const side of [-1,1]){
     const start=origin.add(new Vector3(-direction.z,0,direction.x).scale(side*.17));
     const b=nirvanaBolt(g.vfx,start,direction,false);b.draw(start.add(direction.scale(.6+i*1.3)));bolts.push(b);
   }
   nirvanaMuzzle(g.vfx,origin,direction,false);nirvanaImpact(g.vfx,origin.add(direction.scale(7)),direction);
   g.vfx.update(.04);g.scene.render();
   const streaks=g.vfx.quads.filter(q=>q.busy&&!q.billboard&&q.scaling.x>.4&&q.glow).length;
   window.smgCleanup=()=>{for(const b of bolts)b.stop();g.vfx.update(1);return g.vfx.quads.filter(q=>q.busy).length-baseline;};
   return {duration:decoded.duration,starts,playing,streaks};
 });
 await page.screenshot({path:'artifacts/nayuta/smg-gold.png'});
 const leaked=await page.evaluate(()=>window.smgCleanup());
 console.log({...result,leaked,errors});
 assert.ok(result.duration<=.161);assert.equal(result.starts,30);assert.equal(result.playing,0);assert.ok(result.streaks>=20);assert.equal(leaked,0);assert.deepEqual(errors,[]);
 console.log('PASS: uninterrupted 30-shot audio, gold streak rendering and pooled cleanup.');
} finally {await browser.close();}
