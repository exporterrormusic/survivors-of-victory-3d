import assert from 'node:assert/strict';
import {stormLakeEdge,STORM_LAKE_SPEED,StormField,STORM_ARRIVAL,STORM_SHOALS,STORM_FLOODPLAINS,STORM_CYCLE,STORM_RADIUS,STORM_CHANNELS,STORM_SPLIT_Z,channelOf,channelFlow,stormRegion,floodplainAt} from '../src/survivor/storm-field.ts';
import {stormKitPlacements,stormPlacements,inThicket,STORM_THICKET,STORM_GROVE} from '../src/survivor/storm-layout.ts';
const f=new StormField();f.reset(true);
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
const mid=(id,z)=>({x:channelOf(id).center(z),z});
// Shape: a trunk forking into two branches that diverge at different angles and leave the south edge.
const W=channelOf('west'),E=channelOf('east');
assert.ok(near(W.center(STORM_SPLIT_Z),E.center(STORM_SPLIT_Z),1e-9),'branches start together');
assert.ok(W.center(-40)<-25&&E.center(-40)>30,'branches run down the sides');
assert.ok(Math.abs(W.center(-40)+E.center(-40)-2*W.center(STORM_SPLIT_Z))>3,'not mirror images');
for(const c of [W,E]){let z=0;while(Math.hypot(c.center(z),z)<STORM_RADIUS)z--;assert.ok(z<-40,`${c.id} leaves through the south`);}
assert.equal(stormRegion({x:-50,z:0}),0);assert.equal(stormRegion(STORM_ARRIVAL),1);assert.equal(stormRegion({x:60,z:0}),2);
assert.equal(f.wet(STORM_ARRIVAL),false,'arrival is dry');
// The deep lake closes the south: slow even in calm water, and waders are sent back to its north shore.
assert.ok(near(f.speed({x:0,z:stormLakeEdge(0)-10}),STORM_LAKE_SPEED),'lake is 15% in calm');
assert.equal(f.wet({x:0,z:stormLakeEdge(0)+2}),false,'lake shore is dry in calm');
// Calm speeds.
for(const id of ['trunk','west','east'])assert.ok(near(f.speed(mid(id,id==='trunk'?50:-20)),.48),`${id} calm channel 48%`);
for(const s of STORM_SHOALS)assert.ok(f.speed(mid(s.channel,s.z))>.83,`${s.channel} shoal at ${s.z} wades fast`);
assert.equal(f.speed(mid('west',-20),true),1);
for(const m of STORM_FLOODPLAINS)assert.equal(f.wet(m),false,'tip dry in calm');
// Surge: almost a wall, shoals closed, tip floods, waders wash out toward the nearer bank.
f.update(STORM_CYCLE.calm+STORM_CYCLE.warning+7);assert.equal(f.phase,'surge');assert.equal(f.flood,1);
for(const id of ['trunk','west','east'])assert.ok(near(f.speed(mid(id,id==='trunk'?50:-20)),.1,1e-6),`${id} surge 10%`);
for(const s of STORM_SHOALS)assert.ok(f.speed(mid(s.channel,s.z))<.11,'surge closes shoals');
for(const m of STORM_FLOODPLAINS)assert.ok(f.wet(m),'tip floods');
assert.equal(f.wet(STORM_ARRIVAL),false,'arrival dry at full flood');
for(const id of ['west','east'])for(const s of [-1,1]){const c=channelOf(id),p={x:c.center(-20)+s*3,z:-20};assert.equal(Math.sign(f.current(p).x),s,'pushes to near bank');}
for(const id of ['west','east']){let p={x:channelOf(id).center(-20)-1,z:-20},t=0;
  while(f.wet(p)&&t<10){const c=f.current(p),v=6*f.speed(p);p={x:p.x+(c.x-v)*.05,z:p.z+c.z*.05};t+=.05;}
  assert.ok(!f.wet(p),`${id}: washes out within the surge (${t.toFixed(1)}s)`);}
assert.ok(channelFlow(W,-20).z<0&&channelFlow(E,-20).z<0,'all water flows south');
// AI.
f.reset(true);
const go=(from,to,seed=3,crowd=[])=>f.steer({position:from,radius:.6,alive:true},to,crowd,seed);
const e1=go({x:-50,z:-10},{x:10,z:-10});assert.ok(STORM_SHOALS.some(s=>s.channel==='west'&&Math.abs(e1.z-s.z)<s.half),'west bank to island via a west shoal');
const e2=go({x:-50,z:-10},{x:60,z:-10});assert.ok(STORM_SHOALS.some(s=>Math.abs(e2.z-s.z)<s.half),'west to east picks a shoal');
f.elapsed=STORM_CYCLE.calm+1;
{const w=go({x:-50,z:-10},{x:10,z:-10},5);assert.ok(STORM_SHOALS.some(s=>s.channel==='west'&&Math.abs(w.z-s.z)<s.half),'horde ignores the warning and keeps crossing');}
f.elapsed=STORM_CYCLE.calm+STORM_CYCLE.warning+7;
const held=go({x:-50,z:0},{x:10,z:0});assert.ok(stormRegion(held)===0&&!f.wet(held,.6),'holds near bank in a surge');
assert.ok(!f.wet(go(mid('east',-10),{x:60,z:-10}),.6),'waders head out in a surge');
assert.ok(!floodplainAt(go({...STORM_FLOODPLAINS[0]},{x:0,z:0})),'tip cleared in a surge');
f.reset(true);
const first=go({x:-40,z:6},{x:12,z:6},2),busy=STORM_SHOALS.find(s=>s.channel==='west'&&Math.abs(first.z-s.z)<s.half);
assert.ok(busy,'uses the nearby shoal');
const crowd=Array.from({length:150},()=>({position:mid('west',busy.z),radius:.5,alive:true}));
const second=go({x:-40,z:6},{x:12,z:6},2,crowd);
assert.ok(!(Math.abs(second.x-first.x)<1&&Math.abs(second.z-first.z)<1),'crowded shoal diverts');
f.elapsed=STORM_CYCLE.calm+STORM_CYCLE.warning+7;{const out=f.steer({position:{x:20,z:stormLakeEdge(20)-4},radius:.6,alive:true},{x:20,z:-80},[],0);assert.ok(!f.wet(out,.6)&&out.z>stormLakeEdge(20),'lake waders head back ashore');}
f.reset(true);for(let i=0;i<4000;i++){const b=f.flowTime;f.update(.05);const d=f.flowTime-b;assert.ok(d>=.05-1e-9&&d<=.0725+1e-9);}
// Layout.
f.reset(true);f.elapsed=STORM_CYCLE.calm+STORM_CYCLE.warning+7;
for(const p of stormKitPlacements()){assert.ok(Math.hypot(p.x,p.z)<STORM_RADIUS-6);assert.equal(f.wet(p,5),false,`${p.asset} dry`);}
assert.equal(f.wet(STORM_THICKET,STORM_THICKET.rx),false,'thicket on dry ground');
for(const c of STORM_GROVE)assert.ok(stormPlacements().filter(p=>p.asset==='pine'&&Math.hypot(p.x-c.x,p.z-c.z)<c.r).length>=3,'grove clump has trees');
for(const [i,a] of STORM_GROVE.entries()){const b=STORM_GROVE[(i+1)%STORM_GROVE.length];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)-a.r-b.r>=4,'grove lanes stay open');}
assert.ok(!inThicket(STORM_THICKET.x,STORM_THICKET.z),'grove has an open glade');
assert.ok(stormLakeEdge(0)<-55,'broad beach before the lake');
for(const p of stormPlacements())if(p.asset==='pine'&&Math.hypot(p.x,p.z)<STORM_RADIUS-2)assert.equal(f.wet(p,1),false,'pines dry');
console.log('Storm: fork shape, regions, calm/surge speeds, closing shoals, wash-out, region routing, congestion and layout passed.');

// The wave arrives upstream first; resistance and current wait for the local front.
f.reset(true);f.elapsed=STORM_CYCLE.calm+STORM_CYCLE.warning+2;
const north=mid('trunk',65),south=mid('west',-32);
assert.ok(f.floodAt(north)>.99&&f.floodAt(south)===0);
assert.ok(f.speed(north)<.11&&f.speed(south)>.83);
assert.deepEqual(f.current(south),{x:0,z:0});
for(const z of [65,30,0,-32,-60]){
 const p=mid(z>40?'trunk':'west',z);let previous=0;
 for(let t=0;t<=9;t+=.025){f.elapsed=STORM_CYCLE.calm+STORM_CYCLE.warning+t;const amount=f.floodAt(p);assert.ok(amount>=previous-1e-8&&amount-previous<.04);previous=amount;}
 assert.ok(previous>.99);
}
f.elapsed=0;assert.equal(f.floodAt(south),0);
console.log('Traveling surge: upstream arrival, delayed shoal closure/current, smooth front and cycle reset passed.');
