import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/?run=test-range&character=nayuta&enemies=inactive');
 await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const g=game;g.engine.stopRenderLoop();g.engine.setHardwareScalingLevel(3);g.scene.onBeforeAnimationsObservable.clear();
  const {audioEngine}=await import('/src/audio/audio-engine.ts'),{SFX}=await import('/src/audio/sound-bank.ts');
  audioEngine.preload([SFX.nayutaBurst.url]);const buffer=await audioEngine.buffers.get(SFX.nayutaBurst.url);
  const cues=[],play=audioEngine.play;audioEngine.play=(cue)=>cues.push(cue.url);
  g.kit.useBurst(g.player.position,0);g.kit.update(2.01);audioEngine.play=play;
  for(const t of g.targets.targets)t.alive=false;
  g.kit.useSpecial();g.kit.chargeSpecial(0,false,true);const c=g.targets.squad.find(c=>c.name==='Nayuta (Clone)');
  const t=g.targets.targets[0];t.alive=true;t.hp=1000;t.position.copyFrom(c.position);t.position.z+=2;
  g.targets.navigation.traceCover=()=>null;
  g.kit.update(.01);
  const stationary={upper:c.rig.upper.current,lower:c.rig.lower.current};
  const clip=c.rig.upper.tracks.find(t=>t.name==='cover_shot').group;
  const count=clip.targetedAnimations.length;
  const meshes=new Set([...g.player.chibi.meshes,...c.model.meshes]);for(const m of g.scene.meshes)if(!meshes.has(m))m.isVisible=false;
  clip.goToFrame(clip.from);g.scene.render();c.rig.applyAim();
  const joint=c.model.joint('Bip001 R Hand'),before=Array.from(joint.computeWorldMatrix(true).m);
  clip.goToFrame(clip.from+(clip.to-clip.from)*.35);g.scene.render();c.rig.applyAim();
  const after=Array.from(joint.computeWorldMatrix(true).m),poseDelta=Math.max(...before.map((v,i)=>Math.abs(v-after[i])));
  c.timer=0;t.position.z=c.position.z+7;g.kit.update(.05);
  const moving={upper:c.rig.upper.current,lower:c.rig.lower.current,speed:c.motion.length()};
  const recoil=[];
  for(const rig of [g.player.rig,c.rig]){
    rig.update(.5,{moveX:0,moveZ:0,speed:0,aimYaw:0,posture:'relaxed'});
    let starts=0;const play=rig.upper.play.bind(rig.upper);
    rig.upper.play=(name,opts)=>{if(name==='cover_shot'&&opts?.restart)starts++;return play(name,opts);};
    for(let i=0;i<20;i++)rig.update(.08,{moveX:0,moveZ:0,speed:0,aimYaw:0,posture:'shot'});
    recoil.push(starts);rig.upper.play=play;
  }
  g.kit.dispose();
  return {recoil,voice:SFX.nayutaBurst.url,duration:buffer.duration,voiceCalls:cues.filter(u=>u===SFX.nayutaBurst.url).length,stationary,moving,count,poseDelta,squad:g.targets.squad.length};
 });
 console.log(result);assert.deepEqual(result.recoil,[4,4]);assert.ok(result.duration>0);assert.equal(result.voiceCalls,1);assert.equal(result.stationary.upper,'cover_shot');assert.equal(result.moving.upper,'cover_shot');assert.equal(result.moving.lower,'run');assert.ok(result.poseDelta>.00001);assert.equal(result.squad,0);assert.deepEqual(errors,[]);
 console.log('PASS: local Burst VO once per cast, animated clone recoil standing/running, disposal.');
}finally{await browser.close();}
