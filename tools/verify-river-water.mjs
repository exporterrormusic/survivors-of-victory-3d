// Route 9 Floodway review captures: daylight layout views plus storm-night gameplay. Saves to artifacts/storm-map/floodway/.
import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const base=process.env.STORM_URL??'http://127.0.0.1:5198',out='artifacts/storm-map/river-water';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?run=test-range&environment=storm`);
 await page.waitForFunction(()=>window.game?.player&&window.game?.storm?.field.enabled&&window.game.scene.isReady(),null,{timeout:240000});
 await page.evaluate(()=>{const g=window.game;g.targets.setMovement('inactive');g.engine.stopRenderLoop();});
 const seal=await page.evaluate(async()=>{
  const {stormObstacles}=await import('/src/survivor/storm-map.ts'),{STORM_RADIUS}=await import('/src/survivor/storm-field.ts');
  const obs=stormObstacles(),open=[];
  for(let i=0;i<720;i++){const a=i*Math.PI/360;let hit=false;
   for(let r=STORM_RADIUS-2;r<STORM_RADIUS+4&&!hit;r+=.25){const x=Math.cos(a)*r,z=Math.sin(a)*r;hit=obs.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+.45);}
   if(!hit)open.push(+(a*180/Math.PI).toFixed(1));}
  return open;
 });
 console.log(seal.length?`EDGE OPEN at ${seal.join(', ')} deg`:'edge sealed all the way round');
 const shots=[
  {name:'front-north',eye:[0,150,-95],at:[0,0,0],phase:52.5,day:true},
  {name:'front-branches',eye:[0,150,-95],at:[0,0,0],phase:54.5,day:true},
  {name:'front-lake',eye:[0,150,-95],at:[0,0,0],phase:58,day:true},
  {name:'mouth-calm',eye:[-20,22,-30],at:[-37,0,-52],phase:20,day:true},
  {name:'mouth-surge',eye:[-20,22,-30],at:[-37,0,-52],phase:58,day:true},
  {name:'fork-calm',eye:[8,18,10],at:[8,0,31],phase:20,day:true},
  {name:'fork-surge',eye:[8,18,10],at:[8,0,31],phase:58,day:true},
  {name:'overview',eye:[0,190,-130],at:[0,0,-10],phase:20,day:true},
  {name:'overview-surge',eye:[0,190,-130],at:[0,0,-10],phase:58,day:true},
  {name:'lake-shore',eye:[-6,24,-26],at:[4,0,-52],phase:20,day:true},
  {name:'falls-fork',eye:[0,30,14],at:[10,2,58],phase:20,day:true},
  {name:'west-shoal',eye:[-30,20,-6],at:[-14,0,10],phase:20,day:true},
  {name:'east-shoal-surge',eye:[20,20,-30],at:[42,0,-12],phase:58,day:true},
  {name:'thicket',eye:[-30,26,-8],at:[-46,0,20],phase:20,day:true},
  {name:'island-wreck',eye:[0,22,-12],at:[12,0,-36],phase:20,day:true},
  {name:'night-gameplay',player:[4,0,-10],phase:20,day:false},
  {name:'night-surge',player:[-14,0,-20],phase:58,day:false},
 ];
 for(const shot of shots.filter(s=>['overview-surge','west-shoal','east-shoal-surge','fork-calm','fork-surge','mouth-calm','mouth-surge','front-north','front-branches','front-lake'].includes(s.name))){
  await page.evaluate(({eye,at,player,phase,day})=>{
   const g=window.game;g.player.hp=g.player.maxHp;g.storm.field.elapsed=phase;
   if(day){
    g.camera.update=()=>{};g.atmosphere.set('day','clear',true);g.atmosphere.update=()=>{};g.scene.fogDensity=.003;
    const c=g.camera.camera;c.position.set(...eye);c.setTarget(c.position.clone().set(...at));c.getViewMatrix(true);g.camera.focus.set(...at);
   }else{
    g.player.position.set(...player);g.camera.snap(g.player.position);
   }
   g.storm.update(0,g.player,g.targets,g.run);g.scene.render();g.scene.render();
  },shot);
  await page.screenshot({path:`${out}/${shot.name}.png`,timeout:120000});
  if(shot.name==='fork-surge'){
   await page.evaluate(()=>{const g=window.game;g.storm.field.flowTime+=.6;g.storm.update(0,g.player,g.targets,g.run);g.scene.render();});
   await page.screenshot({path:`${out}/fork-surge-motion.png`,timeout:120000});
  }
  if(shot.name==='thicket')await page.reload().then(()=>page.waitForFunction(()=>window.game?.player&&window.game?.storm?.field.enabled&&window.game.scene.isReady(),null,{timeout:240000})).then(()=>page.evaluate(()=>{const g=window.game;g.targets.setMovement('inactive');g.engine.stopRenderLoop();}));
 }
 await fs.writeFile(`${out}/errors.json`,JSON.stringify(errors,null,2));
 console.log(errors.length?`errors:\n${errors.join('\n')}`:'no browser errors');if(errors.length)process.exitCode=1;
}finally{await browser.close();}
