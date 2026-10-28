import assert from 'node:assert/strict';
import { FrozenLake, LAKE_HOLE_SECONDS, LAKE_REFROZEN, LAKES, lakeEdge, lakeIce, lakeSnowCover, lakeSurface } from '../src/survivor/frozen-lake.ts';
// Shape: two big lakes with lobes, open snow on the other diagonal, lift on land.
assert.equal(lakeIce(0,0),0,'lift is on land');
for(const l of LAKES){assert.equal(lakeIce(l.x,l.z),1,'blob centre is ice');assert.equal(lakeSnowCover(l.x,l.z),0,'blob centre is bare');}
for(const [x,z] of [[26,26],[-26,-26]])assert.equal(lakeIce(x,z),0,'open diagonal is snow');
let ice=0,cells=0;for(let x=-54;x<=54;x++)for(let z=-54;z<=54;z++)if(Math.hypot(x,z)<54){cells++;if(lakeSurface(x,z)>0)ice++;}
const share=ice/cells;assert.ok(share>.45&&share<.55,`lakes are a big chunk but not the majority (${share.toFixed(2)})`);
let north=0;for(let x=-40;x<=20;x++)if(lakeIce(x,38)>.5)north++;assert.ok(north>20,'north-west lake reaches across the top');
// Each lake is one connected body of ice, not separate ponds.
for(const [sx,sz] of [[-26,21],[26,-21]]){
  const seen=new Set([`${sx},${sz}`]),q=[[sx,sz]];while(q.length){const [x,z]=q.pop();for(const [a,b] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){const k=`${a},${b}`;if(!seen.has(k)&&lakeIce(a,b)>.5){seen.add(k);q.push([a,b]);}}}
  const lobe=sx<0?[4,41]:[-4,-41];assert.ok(seen.has(`${lobe[0]},${lobe[1]}`),'lobe joins its main lake');
}
const l=LAKES[0];let partial=0;for(let r=14;r<=34;r+=.25){const c=lakeSnowCover(l.x+r,l.z);if(c>.05&&c<.95)partial++;}
assert.ok(partial>=6,`gradual shore (${partial} samples)`);

const run=(lake,seconds,fn,stop=()=>false)=>{for(let t=0;t<seconds&&!stop();t+=.05){fn(t);lake.update(.05);}};
const centre={x:LAKES[0].x,z:LAKES[0].z};
// Any movement cracks: a single walk across fresh ice leaves an obvious trail.
const once=new FrozenLake();once.reset(true);
run(once,2,t=>once.load({position:{x:centre.x-6+t*6,z:centre.z},radius:.45},1,.05));
assert.ok(Math.max(...once.stress)>.08&&once.breaks===0,'one pass cracks visibly');
// Healing is slow: a minute later most of the damage is still there.
const peak=Math.max(...once.stress);run(once,60,()=>{});
const healed=Math.max(...once.stress);assert.ok(healed<peak&&healed>peak*.1,'cracks heal, slowly');
// Fast continuous movement spreads light damage without ever dwelling on one cell.
const moving=new FrozenLake();moving.reset(true);let movingAt=0;
run(moving,30,t=>{
  movingAt=t;
  moving.load({position:{x:centre.x+Math.cos(t*1.5)*7,z:centre.z+Math.sin(t*1.5)*7},radius:.45},1,.05);
},()=>moving.pending!==null);
assert.ok(moving.pending&&movingAt<10,'minor crack coverage escalates during continuous fast movement');
const initialStress=Float32Array.from(moving.stress);
assert.ok(Math.max(...initialStress)<.7,'coverage does not snap minor cracks to major fractures');
moving.update(.35);
const growing=Float32Array.from(moving.stress);
assert.ok(growing.some((s,i)=>s>initialStress[i]+.03),'cracks visibly grow during the warning');
assert.ok(growing.every((s,i)=>s-initialStress[i]<.2),'early escalation is gradual');
moving.update(.9);
assert.ok([...moving.stress].filter(s=>s>=.7).length>50,'coverage smoothly promotes the trail to big cracks');
assert.equal(moving.breaks,0,'coverage escalation still gives a warning before collapsing');
run(moving,2,()=>{});
assert.equal(moving.breaks,1,'escalation collapses even after the player leaves');
assert.equal(moving.depth({x:LAKES[3].x,z:LAKES[3].z}),0,'coverage escalation stays local');
moving.reset(true);
assert.equal(moving.pending,null,'reset clears the escalation warning');
assert.equal(Math.max(...moving.stress),0,'reset clears promoted cracks');
// Roaming one lake alone: the ice gives out within a short window, and a big share goes at once.
const fight=new FrozenLake();fight.reset(true);let at=0;
run(fight,150,t=>{at=t;fight.load({position:{x:centre.x+Math.cos(t*.5)*10+Math.sin(t*.23)*4,z:centre.z+Math.sin(t*.37)*10},radius:.45},1,.05);},()=>fight.breaks>0);
assert.ok(fight.breaks===1&&at>5&&at<40,`roaming the ice is time-limited (${at.toFixed(1)} s)`);
// The collapse spreads and gives way over about a second: no water the instant it starts.
const ring=[...fight.hole].findIndex(h=>h>0);assert.equal(fight.openness(ring),0,'ice gives way gradually, not instantly');
run(fight,1.6,()=>{});
const open=[...fight.hole].filter(h=>h>0).length;
const holeIndex=[...fight.hole].findIndex((h,i)=>h>0&&[1,-1,112,-112].every(d=>fight.hole[i+d]>0));
const inHole={x:holeIndex%112-56+.5,z:Math.floor(holeIndex/112)-56+.5};
// Enemies never walk into open water: a step toward a hole slides along its edge instead.
let walker={...inHole};const free=fight.escape(walker);assert.ok(free&&fight.depth(free)===0,'a body in a hole finds dry footing');
walker={...free};for(let i=0;i<120;i++){const to={x:walker.x+(inHole.x-walker.x)*.05,z:walker.z+(inHole.z-walker.z)*.05};fight.avoidHoles(walker,to);walker=to;}
assert.ok(fight.depth(walker)<=.02,'an enemy heading for a hole stops at its edge');
assert.ok(open>250,`collapse chains across the cracked area (${open} m²)`);
assert.ok(fight.speed(inHole)<.6,'wading is slow');
assert.equal(fight.speed(inHole,true),1,'hover units ignore water');
// Untouched ice elsewhere survives the collapse.
assert.equal(fight.depth({x:LAKES[3].x,z:LAKES[3].z}),0,'the other lake is untouched');
// Holes refreeze weak, so the next fight there collapses sooner.
run(fight,LAKE_HOLE_SECONDS+.5,()=>{});
assert.equal(fight.depth(inHole),0,'holes refreeze');
assert.equal(fight.escape(inHole),null,'nothing to escape once refrozen');
assert.ok(Math.max(...fight.stress)>=LAKE_REFROZEN-.02,'refrozen ice stays weak');
// Ground enemies keep to the snow: goals on the ice move to the shore, and steps onto it are cut.
const shore=fight.shoreGoal(centre);assert.ok(lakeSurface(shore.x,shore.z)<-1,'shore goal is on snow');
assert.ok(Math.hypot(shore.x-centre.x,shore.z-centre.z)<30,'shore goal is the near shore');
const land={x:0,z:0};assert.deepEqual(fight.shoreGoal(land),land,'land goals are unchanged');
const off=new FrozenLake();off.load({position:centre,radius:.45},1,100);assert.equal(off.breaks,0,'disabled on other maps');
console.log(`Frozen lake: ${(share*100).toFixed(0)}% of the arena; one pass cracks, slow heal, roaming collapse at ${at.toFixed(1)} s opened ${open} m²; refreezes weak.`);
