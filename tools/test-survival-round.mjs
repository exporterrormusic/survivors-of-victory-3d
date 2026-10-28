import assert from 'node:assert/strict';
import { register, stripTypeScriptTypes } from 'node:module';
import fs from 'node:fs/promises';
register('./ts-hooks.mjs',import.meta.url);
const { SurvivalRound, ROUND_SECONDS, ROUND_MAX_LEVEL, FINAL_TALENT_LEVEL, HEAVY_SCHEDULE, roundXpToNext, catchUp, spawnRate, aliveCap }=await import('../src/survivor/mode/survival-round.ts');
const round=new SurvivalRound();
round.update(120,50);assert.equal(round.elapsed,0,'Lift time is not combat time');
round.start();let bosses=0;const heavies=[],unlocked=[];
for(let second=0;second<ROUND_SECONDS;second++){
 const event=round.update(1,50);if(event.heavy)heavies.push(event.heavy);bosses+=Number(event.boss);unlocked.push(...event.unlocked);
 if(second<ROUND_SECONDS-1)assert.equal(round.phase,'survive');
}
assert.deepEqual(heavies,HEAVY_SCHEDULE.map(h=>h.key),'each heavy arrives once, in order');
assert.equal(bosses,1);assert.equal(round.phase,'boss');
assert.ok(unlocked.includes('pelican')&&unlocked.includes('seahorse')&&!unlocked.includes('lure'),'later Raptures announce as they join');
assert.ok(spawnRate(0)<spawnRate(ROUND_SECONDS)&&aliveCap(0)<aliveCap(ROUND_SECONDS),'pressure only rises');
round.update(30,50);assert.equal(round.phase,'boss','Timer alone cannot win');
round.update(1,50,true);assert.equal(round.phase,'victory');
// ENDLESS: no boss phase, Obelisk every ten minutes, heavies cycle, pressure keeps rising.
const endless=new SurvivalRound(true);endless.start();let endlessBosses=0,endlessHeavies=0;
for(let second=0;second<ROUND_SECONDS*2+5;second++){const e=endless.update(1,50,true);endlessBosses+=Number(e.boss);endlessHeavies+=Number(!!e.heavy);}
assert.equal(endless.phase,'survive','ENDLESS never ends on the timer, even with a boss down');
assert.equal(endlessBosses,2);assert.equal(endlessHeavies,HEAVY_SCHEDULE.length*2);
assert.ok(spawnRate(ROUND_SECONDS*2)>spawnRate(ROUND_SECONDS)&&aliveCap(ROUND_SECONDS*2)>aliveCap(ROUND_SECONDS));
endless.update(1,0);assert.equal(endless.phase,'defeat','ENDLESS ends on death');
const finished=round.elapsed;round.update(10,0);round.abandon();assert.equal(round.elapsed,finished);assert.equal(round.phase,'victory');
const dead=new SurvivalRound();dead.start();dead.update(ROUND_SECONDS,0,true);assert.equal(dead.phase,'defeat','Death wins ties');
const paused=new SurvivalRound();paused.start();paused.update(0,50);assert.equal(paused.elapsed,0);
paused.update(NaN,50);assert.equal(paused.elapsed,0);
// Same ordered talent implementation used by the live menu.
const url=source=>`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64')}`;
const ranksUrl=url(await fs.readFile(new URL('../src/survivor/ability-ranks.ts',import.meta.url),'utf8'));
const {RunTalents}=await import(url((await fs.readFile(new URL('../src/survivor/talents.ts',import.meta.url),'utf8')).replace("'./ability-ranks'",JSON.stringify(ranksUrl))));
const talents=new RunTalents([],undefined,'attack'),wallet={skillPoints:30};
assert.equal(talents.purchase('attack',4,wallet),false,'Cannot skip rank prerequisites');
for(const tree of ['attack','skill','burst'])for(let rank=2;rank<=5;rank++)assert.ok(talents.purchase(tree,rank,wallet));
assert.equal(wallet.skillPoints,0);assert.equal(talents.activeCapstone,'attack');
assert.equal(new RunTalents([]).abilityRank('attack'),1);
// XP pacing: slow, average and fast killers all reach the last talent tier in the last waves.
// (1–4 kills/s: the horde spawns 1.2–4/s, so slower than that and the player is overrun anyway)
for(const killsPerSecond of [1,2,4]){
 let level=1,xp=0,reached=null;
 for(let t=0;t<ROUND_SECONDS;t+=.5){
  xp+=40*killsPerSecond*.5*catchUp(level,xp/roundXpToNext(level),t);
  while(xp>=roundXpToNext(level)&&level<ROUND_MAX_LEVEL){xp-=roundXpToNext(level);level++;}
  if(reached===null&&level>=FINAL_TALENT_LEVEL)reached=t;
 }
 assert.ok(reached!==null&&reached>=480&&reached<=585,`${killsPerSecond} kills/s reaches level ${FINAL_TALENT_LEVEL} at ${reached}s`);
}
// Persistent wallet: one reward, no lost unlocks, atomic retry and storage errors.
const store=new Map();let fail=false;
globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)}};
const key='nikke-moba.roster-v1';
store.set(key,JSON.stringify({pristineCores:2,ownedSkinIds:['kept'],unlockedCharacterIds:['snow-white']}));
const {awardRoundCore}=await import('../src/frontend/profile/RoundRewards.ts');
assert.ok(awardRoundCore('round-a'));assert.ok(awardRoundCore('round-a'));
assert.equal(JSON.parse(store.get(key)).pristineCores,3);
assert.deepEqual(JSON.parse(store.get(key)).ownedSkinIds,['kept']);
fail=true;assert.equal(awardRoundCore('round-b'),false);fail=false;
assert.ok(awardRoundCore('round-b'));assert.equal(JSON.parse(store.get(key)).pristineCores,4);
assert.equal(store.has('nikke-moba.progress-v1'),false,'Round rewards never save talent progression');
console.log('Survival: 10-minute schedule, endless cycles, heavies, XP pacing, boss gate, death, pause, ordered ranks, XP budget and reward persistence passed.');
