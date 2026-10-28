import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.STORM_URL??'http://127.0.0.1:5198',out='artifacts/storm-map';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/?run=test-range&environment=storm&time=day`);
  await page.waitForFunction(()=>window.game?.storm?.field.enabled&&window.game.scene.isReady(),null,{timeout:180000});
  await page.evaluate(()=>{const g=window.game;g.engine.stopRenderLoop();g.camera.update=()=>{};g.targets.setMovement('inactive');});
  const mechanics=await page.evaluate(async()=>{
    const g=window.game,{riverCenter,STORM_BRIDGES}=await import('/src/survivor/storm-field.ts');
    const f=g.storm.field,nav=g.targets.navigation;
    const player=g.player;player.transported=false;player.dashing=0;player.hp=player.maxHp;player.position.set(riverCenter(0),0,0);f.elapsed=49.1;
    const before={hp:player.hp,z:player.position.z};g.storm.update(.05,player,g.targets,g.run);
    const floodDamage=before.hp-player.hp,downstream=player.position.z<before.z;
    const b=STORM_BRIDGES[1];player.hp=player.maxHp;player.position.set(riverCenter(b.z),0,b.z);f.elapsed=51;
    g.storm.update(.05,player,g.targets,g.run);const bridgeSafe=player.hp===player.maxHp&&player.position.z===b.z;
    const ground=g.targets.targets.find(t=>!t.hover);const floating=g.targets.targets.find(t=>t.hover);
    const result={radius:nav.extent,floodDamage,downstream,bridgeSafe,ground:null,hover:null,bridges:[],meshes:g.scene.meshes.length,elevator:{x:g.elevator.root.position.x,z:g.elevator.root.position.z},floor:{x:g.scene.getMeshByName('range-ground').position.x,z:g.scene.getMeshByName('range-ground').position.z}};
    if(ground){ground.hp=ground.maxHp;ground.alive=true;ground.position.set(riverCenter(-12),0,-12);const hp=ground.hp;g.storm.update(1,player,g.targets,g.run);result.ground={damaged:ground.hp<hp,pushed:ground.position.z< -12};}
    if(floating){floating.hp=floating.maxHp;floating.alive=true;floating.position.set(riverCenter(-12),0,-12);const hp=floating.hp;g.storm.update(1,player,g.targets,g.run);result.hover={safe:floating.hp===hp,stationary:floating.position.z===-12};}
    for(const b of STORM_BRIDGES){const x=riverCenter(b.z);result.bridges.push(nav.clear({x:x-b.length/2-1,z:b.z},{x:x+b.length/2+1,z:b.z},.65));}
    f.elapsed=0;player.hp=player.maxHp;player.position.set(-3,0,8);g.storm.update(0,player,g.targets,g.run);
    return result;
  });
  console.log(JSON.stringify(mechanics,null,2));
  assert.equal(mechanics.radius,58);assert.ok(mechanics.floodDamage>0&&mechanics.downstream&&mechanics.bridgeSafe);
  assert.ok(mechanics.bridges.every(Boolean),'all three bridge centre lanes physically clear');
  assert.ok(mechanics.ground?.damaged&&mechanics.ground?.pushed,'grounded Rapture flood damage and displacement');
  assert.ok(mechanics.hover?.safe&&mechanics.hover?.stationary,'floating Rapture immunity');
  assert.deepEqual(mechanics.elevator,{x:-24,z:-34});assert.deepEqual(mechanics.floor,mechanics.elevator,'shaft opening follows elevator');
  const escape=await page.evaluate(async()=>{
    const g=window.game,{riverCenter}=await import('/src/survivor/storm-field.ts'),f=g.storm.field,p=g.player;
    f.elapsed=50;p.hp=p.maxHp;p.trainingReset=0;p.transported=false;p.dashing=0;p.position.set(riverCenter(-12),0,-12);
    for(const t of g.targets.targets)t.position.set(-40,0,20);
    const input={move:()=>[1,0],wasPressed:()=>false,wasReleased:()=>false,isHeld:()=>false};
    let seconds=0;while(seconds<7&&f.wet(p.position)&&p.hp>0){g.storm.update(.05,p,g.targets,g.run);p.update(.05,input,g.aimPoint);seconds+=.05;}
    const result={dry:!f.wet(p.position),hp:p.hp,seconds,downstreamMetres:-12-p.position.z};
    p.hp=p.maxHp;p.damageFlash=0;f.elapsed=0;return result;
  });
  console.log('Player escape:',escape);assert.ok(escape.dry&&escape.hp>0&&escape.seconds<7&&escape.downstreamMetres<12);
  const crowd=await page.evaluate(async()=>{
    const g=window.game,{NavigationAgent}=await import('/src/navigation.ts');
    const nav=g.targets.navigation,f=g.storm.field;f.elapsed=43;
    const bodies=Array.from({length:36},(_,i)=>({position:{x:i<18?-8-(i%3)*1.4:41+(i%3)*1.4,z:3+Math.floor((i%18)/3)*1.7},radius:.45,alive:true}));
    const agents=bodies.map(()=>new NavigationAgent(nav,.45,{delay:.3,distance:.5}));
    const goals=bodies.map((b,i)=>({x:i<18?43:-9,z:b.position.z}));
    let wetSteps=0;
    for(let frame=0;frame<1600;frame++){
      nav.beginFrame(10);
      for(let i=0;i<bodies.length;i++){
        const b=bodies[i];if(Math.hypot(b.position.x-goals[i].x,b.position.z-goals[i].z)<1.5)continue;
        const goal=f.steer(b,goals[i],bodies,i);agents[i].step(b,goal,4*f.speed(b.position),.05,bodies);
        if(f.wet(b.position,.45))wetSteps++;
      }
    }
    return {arrived:bodies.filter((b,i)=>Math.hypot(b.position.x-goals[i].x,b.position.z-goals[i].z)<2).length,total:bodies.length,wetSteps,positions:bodies.map(b=>b.position)};
  });
  console.log('Crowd:',JSON.stringify(crowd));
  assert.ok(crowd.arrived>=32,'opposing bridge crowds make progress without clogging');
  await page.addStyleTag({content:'body * {visibility:hidden !important} canvas#game {visibility:visible !important}'});
  for(const shot of [
    {name:'overview-day',eye:[0,125,-65],target:[0,0,3],time:'day',phase:0},
    {name:'great-bridge',eye:[32,32,-20],target:[16,0,8],time:'day',phase:0},
    {name:'relay-court',eye:[-17,23,11],target:[-28,2,30],time:'day',phase:0},
    {name:'arrival-clearing',eye:[-12,24,-55],target:[-24,0,-34],time:'day',phase:0},
    {name:'flood-surge',eye:[25,35,-30],target:[12,0,-4],time:'day',phase:51},
    {name:'overview-night',eye:[0,115,-60],target:[0,0,3],time:'night',phase:0},
  ]){
    await page.evaluate(({eye,target,time,phase})=>{
      const g=window.game;g.atmosphere.set(time,time==='day'?'clear':'storm',true);
      const update=g.atmosphere.update;g.atmosphere.update=()=>{};g.scene.fogDensity=.002;
      g.storm.field.elapsed=phase;g.storm.update(0,g.player,g.targets,g.run);g.player.damageFlash=0;
      const c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...target));g.camera.focus.set(...target);c.getViewMatrix(true);
      g.scene.render();g.atmosphere.update=update;
    },shot);
    await page.screenshot({path:`${out}/${shot.name}.png`});
  }
  await fs.writeFile(`${out}/verification.json`,JSON.stringify({mechanics,escape,crowd,errors},null,2));
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
