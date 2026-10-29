import { ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { ARK, LANES, OBJECTIVE_SITES, BOUNDS, MAP_WIDTH, MAP_DEPTH, LANE_WIDTH, SPAWN_X, corridors, distance, walkable } from './layout';
import type { Point } from './layout';
import { SiegeSimulation } from './simulation';
import './siege.css';
import { revealLevelTransition } from '../frontend/level-transition';

// Deliberately self-contained: this graybox does not read or modify character progression.
document.body.innerHTML=`<main id="siege"><canvas id="siege-canvas" aria-label="Ark siege playable graybox"></canvas>
<header><div><small>LARGE MAP / 408 × 228 M</small><h1>ARK SIEGE</h1><p>Three lanes. Hold the line. Bring them home.</p></div><div class="actions"><a href="?preview=stage-select">Stage select</a><button id="view">Follow player · Tab</button><button id="pause">Pause · P</button><button id="reset">Reset</button></div></header>
<aside id="readout"><div id="stats"></div><div id="lanes"></div><canvas id="siege-minimap" width="272" height="148" aria-label="Map overview; click to inspect"></canvas><p class="legend"><i class="cyan"></i> Allied <i class="red"></i> Raptures <i class="gold"></i> Objectives</p></aside>
<div id="world-labels" aria-hidden="true"></div><section id="lab"><details><summary>Graybox controls</summary><label>Surface <select id="surface"><option value="gray">Neutral gray</option><option value="snow">Snow study</option><option value="rain">Rain study</option></select></label><label>Simulation <select id="speed"><option value="1">1×</option><option value="3">3×</option></select></label><button id="breach">Breach top gate</button><button id="home">Return to elevator</button><p>Test controls only. No building, rewards, talents, or network co-op. Snow/rain are material studies, not finished weather.</p></details></section>
<footer><div id="message" role="status"></div><div id="player-status"></div><p><b>WASD</b> Move &nbsp; <b>Mouse + LMB</b> Aim / fire &nbsp; <b>Shift</b> Dash &nbsp; <b>E</b> Rescue / collect &nbsp; <b>Tab</b> Overview / follow &nbsp; <b>Wheel</b> Zoom</p></footer></main>`;
document.title='Ark Siege · Playable Graybox';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('siege-canvas');
const engine=new Engine(canvas,true,{stencil:true},true);
engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
const scene=new Scene(engine);scene.clearColor=new Color4(.065,.085,.11,1);scene.skipPointerMovePicking=true;
const camera=new ArcRotateCamera('siege-camera',-Math.PI/2,.2,300,Vector3.Zero(),scene);
camera.mode=ArcRotateCamera.ORTHOGRAPHIC_CAMERA;camera.minZ=.1;camera.maxZ=1000;
scene.activeCamera=camera;
new HemisphericLight('sky',new Vector3(0,1,0),scene).intensity=.85;
new DirectionalLight('sun',new Vector3(-.6,-1,.4),scene).intensity=.65;
const mat=(name:string,hex:string,emissive=false)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=Color3.Black();if(emissive)m.emissiveColor=m.diffuseColor.scale(.5);return m;};
const m={ground:mat('ground','#3b454e'),road:mat('roads','#879095'),rock:mat('terrain blockers','#56616b'),wall:mat('fixed defenses','#c1c7cb'),dark:mat('steel','#26333f'),ally:mat('allied cyan','#42d9e5',true),enemy:mat('hostile coral','#ef6b67',true),gold:mat('objective amber','#f4c869',true),white:mat('player','#f5f4e9'),rubble:mat('destroyed concrete','#595e64'),lost:mat('occupied ground','#b3474d'),line:mat('starting front','#79b9c2',true)};
m.lost.alpha=.28;
function box(name:string,p:Point,w:number,h:number,d:number,material:StandardMaterial,y=h/2){const b=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);b.position.set(p.x,y,p.z);b.material=material;b.isPickable=false;return b;}
function disc(name:string,p:Point,r:number,material:StandardMaterial,y=.04){const b=MeshBuilder.CreateCylinder(name,{diameter:r*2,height:.08,tessellation:32},scene);b.position.set(p.x,y,p.z);b.material=material;b.isPickable=false;return b;}
function road(a:Point,b:Point,width:number){const d=distance(a,b);const mesh=box('walkable corridor',{x:(a.x+b.x)/2,z:(a.z+b.z)/2},width,.05,d,m.road,.02);mesh.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);disc('junction',a,width/2,m.road,.02);disc('junction',b,width/2,m.road,.02);}
const groundLabels:Mesh[]=[];
function label(text:string,p:Point,width=13,size=44,color='#e6f0f3'){
  const textureWidth=Math.ceil(text.length*size*.68+32);
  const tex=new DynamicTexture(`label-${text}`,{width:textureWidth,height:128},scene,false);tex.hasAlpha=true;
  tex.drawText(text,null,84,`bold ${size}px sans-serif`,color,'transparent',true);
  const material=new StandardMaterial(`label-mat-${text}`,scene);material.diffuseTexture=tex;material.emissiveColor=Color3.White();material.disableLighting=true;material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;
  const mesh=MeshBuilder.CreateGround(`label-${text}`,{width,height:width*128/textureWidth},scene);mesh.position.set(p.x,.13,p.z);mesh.material=material;mesh.isPickable=false;groundLabels.push(mesh);return mesh;
}
box('map footprint',{x:0,z:0},MAP_WIDTH,.5,MAP_DEPTH,m.ground,-.35);
for(const c of corridors)road(c.a,c.b,c.width);
disc('Ark plaza',ARK,12,m.road);for(const p of OBJECTIVE_SITES)disc('objective clearing',p,8,m.road);
// Blockers are sampled from the same navigation function used by the player.
// Low box silhouettes retain visibility and can later be replaced by the environment kit.
for(let x=-186;x<=186;x+=12)for(let z=-96;z<=96;z+=12){
  if(walkable({x,z},-7.7)||Math.abs(x)<2)continue;
  const height=1.8+((Math.abs(x*7+z*3)%9)/9)*2;
  box('terrain block',{x,z},10.8,height,10.8,m.rock);
}
for(let z=-102;z<=102;z+=12)box('starting boundary',{x:0,z},.4,.04,5,m.line,.08);
label('ARK / ALLIED HALF',{x:-93,z:109},78);label('ENEMY TERRITORY',{x:99,z:109},84);
label('STARTING FRONT',{x:0,z:-109},57,42,'#8ce5ec');
for(let lane=0;lane<3;lane++){label(['TOP','MID','BOT'][lane],{x:-60,z:LANES[lane]+15},16);label('SPAWN',{x:SPAWN_X,z:LANES[lane]+15},20,40,'#ff9b94');disc('enemy spawn',{x:SPAWN_X,z:LANES[lane]},5,m.enemy);}
label('RESCUE',{x:54,z:47},18,40,'#ffda8a');label('SUPPLY',{x:129,z:-25},18,40,'#ffda8a');label('ARTILLERY',{x:153,z:87},24,40,'#ffda8a');
// Elevator blockout. Three closed sides; opening and cyan threshold face +X/right.
box('lift deck',ARK,8,.4,8,m.dark);
box('lift back',{x:ARK.x-4,z:0},.5,5,8,m.wall);
for(const z of [-4,4]){box('lift side',{x:ARK.x,z},8,3,.4,m.wall);for(const x of [ARK.x-4,ARK.x+4])box('lift mast',{x,z},.5,6,.5,m.dark);}
box('exit threshold faces lanes',{x:ARK.x+4.2,z:0},.35,.15,7.5,m.ally,.3);
for(const x of [ARK.x,ARK.x+2,ARK.x+4]){const marker=MeshBuilder.CreateCylinder('exit arrow',{diameter:1.3,height:.1,tessellation:3},scene);marker.material=m.ally;marker.position.set(x,.3,0);marker.rotation.y=Math.PI/2;}
label('ELEVATOR →',{x:ARK.x,z:-15},24);
let sim=new SiegeSimulation();
const defenseMeshes=new Map<string,Mesh[]>();
for(const d of sim.defenses){
  const pieces:Mesh[]=[];
  for(const offset of [-6,6])pieces.push(box(`${d.id}-wall`,{x:d.x,z:d.z+offset},1.2,2.8,6,m.wall));
  const turret=box(`${d.id}-turret`,{x:d.x-1.7,z:d.z+7.5},1.4,3.3,1.4,m.dark);pieces.push(turret);
  pieces.push(box(`${d.id}-barrel`,{x:d.x-.4,z:d.z+7.5},3,.45,.5,m.ally,3.2));
  // Door leaves leave a central infantry opening; enemies attack the gate position.
  if(d.tier==='gate')for(const z of [-2.4,2.4])pieces.push(box(`${d.id}-door`,{x:d.x,z:d.z+z},.5,2,1.2,m.dark));
  defenseMeshes.set(d.id,pieces);
}
const lostMeshes=LANES.map((z,i)=>{const b=box(`captured lane ${i}`,{x:-45,z},90,.04,LANE_WIDTH,m.lost,.1);b.setEnabled(false);return b;});
const player=MeshBuilder.CreateCapsule('player',{height:2.2,radius:.6,tessellation:8},scene);player.material=m.white;player.isPickable=false;
const playerRing=MeshBuilder.CreateTorus('player ring',{diameter:2,thickness:.12,tessellation:24},scene);playerRing.material=m.ally;playerRing.isPickable=false;
const rifle=box('graybox rifle',{x:0,z:0},1.7,.25,.3,m.dark);rifle.parent=player;rifle.position.set(.8,.1,0);
const units=new Map<number,Mesh>();const objectives=new Map<string,Mesh>();
const FULL_MAP_WIDTH=450;
let shotMeshes:Mesh[]=[];let overview=true,viewWidth=FULL_MAP_WIDTH,speed=1;const focus={x:0,z:0};
const keys=new Set<string>();let firing=false;let mouse={x:0,y:0};
const map=$<HTMLCanvasElement>('siege-minimap'),ctx=map.getContext('2d')!;
function fitCamera(){
  const aspect=engine.getRenderWidth()/engine.getRenderHeight();const width=overview&&viewWidth>=FULL_MAP_WIDTH?Math.max(viewWidth,270*aspect):viewWidth;
  camera.orthoLeft=-width/2;camera.orthoRight=width/2;camera.orthoTop=width/aspect/2;camera.orthoBottom=-width/aspect/2;
}
function toggleView(){overview=!overview;viewWidth=overview?FULL_MAP_WIDTH:45;focus.x=0;focus.z=0;$('view').textContent=overview?'Follow player · Tab':'Full map · Tab';fitCamera();}
function pause(){sim.paused=!sim.paused;firing=false;keys.clear();$('pause').textContent=sim.paused?'Resume · P':'Pause · P';}
$('view').onclick=toggleView;$('pause').onclick=pause;$('reset').onclick=()=>location.reload();
$('breach').onclick=()=>sim.breach(0);$('home').onclick=()=>{Object.assign(sim.player,ARK,{hp:100,respawn:0});for(const o of sim.objectives)if(o.state==='escorting'){o.state='available';o.trail=[];}sim.message='Returned to elevator. Active escorts left at their location.';};
$<HTMLSelectElement>('speed').onchange=e=>{speed=Number((e.target as HTMLSelectElement).value);};
$<HTMLSelectElement>('surface').onchange=e=>{
  const surface=(e.target as HTMLSelectElement).value;
  m.ground.diffuseColor=Color3.FromHexString(surface==='snow'?'#c1ccd3':surface==='rain'?'#263940':'#3b454e');
  m.road.diffuseColor=Color3.FromHexString(surface==='snow'?'#e1e8e9':surface==='rain'?'#586976':'#879095');
  m.rock.diffuseColor=Color3.FromHexString(surface==='snow'?'#899ba8':'#56616b');
  scene.fogMode=surface==='rain'?Scene.FOGMODE_EXP:Scene.FOGMODE_NONE;scene.fogDensity=.002;scene.fogColor=new Color3(.15,.2,.25);
};
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,select,textarea'))return;
  if(['Tab','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();
  if(e.repeat)return;keys.add(e.code);
  if(e.code==='Tab')toggleView();if(e.code==='KeyP')pause();if(e.code==='KeyE')sim.interact();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();firing=false;if(!sim.paused)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!sim.paused)pause();});
canvas.addEventListener('pointermove',e=>{mouse={x:e.offsetX,y:e.offsetY};});
canvas.addEventListener('pointerdown',e=>{if(e.button===0){mouse={x:e.offsetX,y:e.offsetY};firing=true;}});
window.addEventListener('pointerup',()=>firing=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();viewWidth=Math.max(24,Math.min(570,viewWidth*Math.exp(Math.sign(e.deltaY)*.1)));fitCamera();},{passive:false});
map.onclick=e=>{const r=map.getBoundingClientRect();focus.x=(e.clientX-r.left)/r.width*MAP_WIDTH+BOUNDS.left;focus.z=BOUNDS.top-(e.clientY-r.top)/r.height*MAP_DEPTH;overview=true;viewWidth=55;$('view').textContent='Follow player · Tab';fitCamera();};
function aim():Point {
  const ray=scene.createPickingRay(mouse.x,mouse.y,Matrix.Identity(),camera);
  const t=-ray.origin.y/ray.direction.y;return {x:ray.origin.x+ray.direction.x*t,z:ray.origin.z+ray.direction.z*t};
}
function updateMap(){
  const tx=(x:number)=>(x-BOUNDS.left)/MAP_WIDTH*272,tz=(z:number)=>(BOUNDS.top-z)/MAP_DEPTH*148;
  ctx.fillStyle='#111f29';ctx.fillRect(0,0,272,148);
  ctx.strokeStyle='#586775';ctx.lineWidth=5;
  for(const c of corridors){ctx.beginPath();ctx.moveTo(tx(c.a.x),tz(c.a.z));ctx.lineTo(tx(c.b.x),tz(c.b.z));ctx.stroke();}
  for(const d of sim.defenses){ctx.fillStyle=d.hp>0?'#57dfdf':'#be4b55';ctx.fillRect(tx(d.x)-3,tz(d.z)-3,6,6);}
  for(const u of sim.units){ctx.fillStyle=u.side==='ally'?'#57dfdf':'#ff7770';ctx.fillRect(tx(u.x)-1,tz(u.z)-1,2,2);}
  for(const o of sim.objectives)if(o.state!=='complete'){ctx.fillStyle='#ffd680';ctx.fillRect(tx(o.x)-2,tz(o.z)-2,4,4);}
  ctx.fillStyle='white';ctx.beginPath();ctx.arc(tx(sim.player.x),tz(sim.player.z),3,0,Math.PI*2);ctx.fill();
}
let hudTimer=0;
const worldLabels=new Map<string,HTMLDivElement>();
function screenPoint(p:Point){const v=Vector3.Project(new Vector3(p.x,0,p.z),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));return {x:v.x*engine.getHardwareScalingLevel(),y:v.y*engine.getHardwareScalingLevel()};}
function floatingLabel(id:string,p:Point,text:string,color:string){
  let el=worldLabels.get(id);if(!el){el=document.createElement('div');$('world-labels').appendChild(el);worldLabels.set(id,el);}
  const pos=Vector3.Project(new Vector3(p.x,3,p.z),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
  const scale=engine.getHardwareScalingLevel();
  el.textContent=text;el.style.color=color;el.style.left=`${pos.x*scale}px`;el.style.top=`${pos.y*scale}px`;
  el.style.display=pos.z>0&&pos.z<1&&pos.x>0&&pos.x<engine.getRenderWidth()?'block':'none';
}
function render(dt:number){
  player.position.set(sim.player.x,1.1,sim.player.z);player.setEnabled(sim.player.respawn<=0);playerRing.position.set(sim.player.x,.2,sim.player.z);
  const at=aim();player.rotation.y=-Math.atan2(at.z-sim.player.z,at.x-sim.player.x);
  camera.beta=overview?.12:.55;camera.target.set(overview?focus.x:sim.player.x,0,overview?focus.z:sim.player.z);
  for(const mesh of groundLabels)mesh.setEnabled(overview&&viewWidth>150);
  for(const el of worldLabels.values())el.style.display='none';
  for(const o of sim.objectives)if(o.state!=='complete')floatingLabel(o.id,o,o.guards>0?`${o.kind.toUpperCase()} · GUARDS ${Math.ceil(o.guards)}`:o.state==='escorting'?'ESCORT → ARK':`${o.kind.toUpperCase()} · E`,'#ffda8a');
  if(!overview)for(const d of sim.defenses)if(distance(d,sim.player)<22)floatingLabel(d.id,d,d.hp>0?`${d.tier.toUpperCase()} ${Math.ceil(d.hp/d.maxHp*100)}%`:'DESTROYED',d.hp>0?'#8de1e5':'#ff9b94');
  for(const d of sim.defenses){const meshes=defenseMeshes.get(d.id)!;for(const mesh of meshes){mesh.scaling.y=d.hp>0?1:.16;mesh.material=d.hp>0?(mesh.name.includes('barrel')?m.ally:mesh.name.includes('wall')?m.wall:m.dark):m.rubble;}}
  for(let i=0;i<3;i++){const front=sim.front(i);const lost=lostMeshes[i];lost.setEnabled(front<0);lost.position.x=front/2;lost.scaling.x=Math.abs(front)/90;}
  const live=new Set(sim.units.map(u=>u.id));for(const [id,mesh]of units)if(!live.has(id)){mesh.dispose();units.delete(id);}
  for(const u of sim.units){let mesh=units.get(u.id);if(!mesh){mesh=u.side==='ally'?MeshBuilder.CreateCapsule(`ally-${u.id}`,{height:1.7,radius:.4,tessellation:6},scene):MeshBuilder.CreateBox(`rapture-${u.id}`,{width:u.heavy?2:1.3,height:u.heavy?1.7:.9,depth:u.heavy?2:1.3},scene);mesh.material=u.side==='ally'?m.ally:m.enemy;mesh.isPickable=false;units.set(u.id,mesh);}mesh.position.set(u.x,u.heavy?.85:.7,u.z);}
  for(const o of sim.objectives){let mesh=objectives.get(o.id);if(!mesh){mesh=box(o.id,o,2,1.8,2,m.gold);objectives.set(o.id,mesh);}mesh.setEnabled(o.state!=='complete');mesh.position.set(o.x,1.2+Math.sin(sim.time*2)*.15,o.z);mesh.rotation.y=sim.time*.4;mesh.material=o.guards>0?m.enemy:m.gold;}
  for(const mesh of shotMeshes)mesh.dispose();shotMeshes=[];
  for(const s of sim.shots){const line=MeshBuilder.CreateLines('shot',{points:[new Vector3(s.from.x,1.4,s.from.z),new Vector3(s.to.x,1.4,s.to.z)]},scene);line.color=s.side==='enemy'?new Color3(1,.3,.3):s.side==='player'?new Color3(1,.9,.6):new Color3(.3,1,1);shotMeshes.push(line);}
  hudTimer-=dt;if(hudTimer<=0){hudTimer=.15;updateMap();
    $('stats').innerHTML=`<b>WAVE ${String(sim.wave).padStart(2,'0')}</b><span>${Math.floor(sim.time/60)}:${String(Math.floor(sim.time%60)).padStart(2,'0')} · Ark ${Math.ceil(sim.core.hp/sim.core.maxHp*100)}%</span>`;
    $('lanes').innerHTML=LANES.map((_,i)=>{const d=sim.defenses.find(d=>d.lane===i&&d.hp>0);return `<div><b>${['TOP','MID','BOT'][i]}</b><span>${d?`${d.tier.toUpperCase()} ${Math.ceil(d.hp/d.maxHp*100)}%`:'BREACHED'}</span></div>`;}).join('');
    $('message').textContent=sim.message;
    $('player-status').textContent=sim.ended?'ARK LOST · Reset to retry':sim.paused?'PAUSED':sim.player.respawn>0?`REDEPLOY IN ${Math.ceil(sim.player.respawn)}s`:`HP ${Math.ceil(sim.player.hp)} / 100   ·   Squads rescued ${sim.rescued}   ·   ${sim.objectives.filter(o=>o.state==='escorting').length?'ESCORT ACTIVE — RETURN TO ELEVATOR':'Shoot red objective guards; E when close'}`;
  }
}
window.addEventListener('resize',()=>{engine.resize();fitCamera();});fitCamera();
const zone=new URLSearchParams(location.search).get('zone')??'';
if(zone.startsWith('snow')||zone.startsWith('frozen')||zone==='storm'){
  const select=$<HTMLSelectElement>('surface');select.value=zone==='storm'?'rain':'snow';select.dispatchEvent(new Event('change'));
}
// Read-only inspection plus explicit controls used by prototype verification.
Object.assign(window,{siege:{scene,sim,camera,walkable,screenPoint,overview:()=>overview,setPlayer:(p:Point)=>{if(walkable(p))Object.assign(sim.player,p);},toggleView}});
let startingLevel = true;
void scene.whenReadyAsync().then(() => {
  scene.onAfterRenderObservable.addOnce(() => {
    requestAnimationFrame(() => {
      void revealLevelTransition().finally(() => { startingLevel = false; });
    });
  });
});
engine.runRenderLoop(()=>{
  const dt=Math.min(engine.getDeltaTime()/1000,.05);
  for(let i=0;!startingLevel&&i<speed;i++){if(firing)sim.fire(aim());sim.step(dt,{x:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')});}
  render(dt);scene.render();
});
